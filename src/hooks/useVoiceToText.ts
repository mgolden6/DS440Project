import { useState, useCallback } from 'react';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

export function useVoiceToText() {
    const [status, setStatus] = useState<'idle' | 'listening' | 'done' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);

    // Track finalized sentences (from continuous segments) and the current interim sentence separately
    const [finalizedText, setFinalizedText] = useState('');
    const [interimText, setInterimText] = useState('');

    // The combined transcript to show to the user
    const transcript = [finalizedText, interimText].filter(Boolean).join(' ');

    const handleSetTranscript = useCallback((text: string) => {
        // If the user manually edits the transcript, we treat it as finalized and clear interim
        setFinalizedText(text);
        setInterimText('');
    }, []);

    useSpeechRecognitionEvent('start', () => {
        console.log('[DEBUG] Speech Recognition Started');
        setStatus('listening');
        setError(null);
    });

    useSpeechRecognitionEvent('end', () => {
        console.log('[DEBUG] Speech Recognition Ended');
    });

    useSpeechRecognitionEvent('result', (event) => {
        if (!event.results || event.results.length === 0) return;

        // event.results contains alternative hypotheses for the *current* utterance segment.
        // We only want the most confident one (the first one).
        const currentSegment = event.results[0].transcript;
        
        console.log(`[DEBUG] Speech Recognition Result: "${currentSegment}" (isFinal: ${event.isFinal})`);

        if (event.isFinal) {
            // When a segment is final, append it to finalizedText and clear interimText
            setFinalizedText(prev => [prev, currentSegment].filter(Boolean).join(' '));
            setInterimText('');
        } else {
            // Otherwise, just update the interim text
            setInterimText(currentSegment);
        }
    });

    useSpeechRecognitionEvent('error', (event) => {
        console.error('[DEBUG] Speech Recognition Error:', event.error, event.message);
        setError(event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setStatus('error');
        }
    });

    const startRecording = useCallback(async () => {
        console.log('[DEBUG] startRecording() called');
        setFinalizedText('');
        setInterimText('');
        setError(null);

        try {
            const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
            if (!result.granted) {
                console.warn('[DEBUG] Permissions not granted');
                setError('not-allowed');
                setStatus('error');
                return;
            }

            ExpoSpeechRecognitionModule.start({
                lang: 'en-US',
                interimResults: true,
                continuous: true,
            });
        } catch (e: any) {
            console.warn('[DEBUG] start() failed:', e.message);
            setStatus('error');
            setError(e.message);
        }
    }, []);

    const stopRecording = useCallback(() => {
        console.log('[DEBUG] stopRecording() called');
        try {
            ExpoSpeechRecognitionModule.stop();
        } catch (e: any) {
            console.warn('[DEBUG] stop() failed:', e.message);
        }
        setStatus('done');
    }, []);

    const abortRecording = useCallback(() => {
        console.log('[DEBUG] abortRecording() called');
        try {
            ExpoSpeechRecognitionModule.abort();
        } catch (e: any) {
            console.warn('[DEBUG] abort() failed:', e.message);
        }
        setStatus('done');
    }, []);

    return { 
        status, 
        transcript, 
        setTranscript: handleSetTranscript, 
        error, 
        startRecording, 
        stopRecording,
        abortRecording
    };
}
