import React, { useState, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, TextInput,
    KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVoiceToText } from '@/hooks/useVoiceToText';
import { useAudioLevel } from '@/hooks/useAudioLevel';
import { useFlowStore } from '@/store/flowStore';
import { router } from 'expo-router';

export default function HomeRecordingScreen() {
    const { status, transcript, setTranscript, error, stopRecording, startRecording, abortRecording } = useVoiceToText();
    // useAudioLevel handles background visualizer hooks, we keep it active.
    const volume = useAudioLevel(status === 'listening');
    const setFlowTranscript = useFlowStore((state) => state.setTranscript);
    const resetFlow = useFlowStore((state) => state.resetFlow);
    const [isSecure, setIsSecure] = useState(true);

    useEffect(() => {
        resetFlow();
        startRecording();

        if (Platform.OS === 'web' && !window.isSecureContext) {
            setIsSecure(false);
        }

        return () => {
            abortRecording();
        };
    }, []);

    const handleStop = () => {
        stopRecording();
        setFlowTranscript(transcript);
        router.push('/results');
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView
                style={styles.keyboardAvoid}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Warnings and Header in normal document flow (No absolute positioning) */}
                    {!isSecure && (
                        <View style={styles.warningBox}>
                            <Text style={styles.warningText}>⚠️ Voice requires HTTPS or localhost.</Text>
                        </View>
                    )}

                    <View style={styles.header}>
                        <Text style={styles.debugText}>STATUS: {status.toUpperCase()}</Text>
                        {error && <Text style={styles.errorText}>Error: {error}</Text>}
                    </View>

                    <Text style={styles.title}>
                        {status === 'listening' ? 'Speak Food Items...' : 'Processing...'}
                    </Text>

                    {/* Transcript Box */}
                    <View style={styles.transcriptContainer}>
                        <TextInput
                            style={styles.transcriptInput}
                            multiline
                            placeholder='Describe your meal (e.g. "I had a salad and a coke")'
                            placeholderTextColor="#666"
                            value={transcript}
                            onChangeText={setTranscript}
                            autoFocus
                        />
                    </View>

                    {/* Audio Visualizer */}
                    <View style={styles.visualizerContainer}>
                        {[1, 2, 3, 4, 5].map((i) => (
                            <View
                                key={i}
                                style={[
                                    styles.visualizerBar,
                                    { height: status === 'listening' ? 10 + (Math.random() * 30 * (transcript.length > 0 ? 1.5 : 1)) : 10 }
                                ]}
                            />
                        ))}
                    </View>

                    {/* Submit Button */}
                    <TouchableOpacity
                        style={styles.stopButton}
                        testID="btn-stop-recording"
                        onPress={handleStop}
                    >
                        <Text style={styles.stopText}>Finish & Verify</Text>
                    </TouchableOpacity>

                    {status === 'error' && (
                        <TouchableOpacity onPress={startRecording} style={styles.retryButton}>
                            <Text style={styles.retryText}>Retry Microphone</Text>
                        </TouchableOpacity>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#0a0a0a',
    },
    keyboardAvoid: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        alignItems: 'center',
        padding: 24,
        paddingTop: 40,
        paddingBottom: 60, // Ensure bottom isn't cut off on small screens
    },
    header: {
        alignItems: 'center',
        marginBottom: 24,
        minHeight: 24,
    },
    debugText: {
        color: '#666',
        fontSize: 11,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    warningBox: {
        backgroundColor: '#FF9500',
        padding: 12,
        borderRadius: 8,
        marginBottom: 20,
        width: '100%',
    },
    warningText: {
        color: '#000',
        fontWeight: 'bold',
        textAlign: 'center',
    },
    title: {
        fontSize: 26,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 24,
        textAlign: 'center',
    },
    errorText: {
        color: '#FF3B30',
        fontSize: 12,
        marginTop: 4,
    },
    transcriptContainer: {
        width: '100%',
        backgroundColor: '#1c1c1e',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#3a3a3c',
        padding: 20,
        marginBottom: 32,
        minHeight: 160,
    },
    transcriptInput: {
        flex: 1, // Fixes infinite height bugs on Android compared to height: 100%
        fontSize: 20,
        color: '#fff',
        textAlign: 'center',
        fontStyle: 'italic',
        minHeight: 100, // Replaces height constraint
    },
    visualizerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 60,
        marginBottom: 40,
        gap: 6,
    },
    visualizerBar: {
        width: 4,
        backgroundColor: '#007AFF',
        borderRadius: 2,
    },
    stopButton: {
        width: '100%',
        maxWidth: 320,
        paddingVertical: 18,
        borderRadius: 35,
        backgroundColor: '#007AFF',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#007AFF',
        shadowOpacity: 0.4,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        marginBottom: 20,
    },
    stopText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold'
    },
    retryButton: {
        padding: 12,
    },
    retryText: {
        color: '#007AFF',
        fontWeight: '600',
        fontSize: 16,
    },
});
