import React from 'react';
import { render } from '@testing-library/react-native';
import HomeRecordingScreen from '@/screens/HomeRecordingScreen';

// Mock the hooks
jest.mock('@/hooks/useVoiceToText', () => ({
    useVoiceToText: () => ({
        status: 'listening',
        transcript: 'pizza',
        setTranscript: jest.fn(),
        error: null,
        startRecording: jest.fn(),
        stopRecording: jest.fn(),
        abortRecording: jest.fn(),
    }),
}));

jest.mock('@/hooks/useAudioLevel', () => ({
    useAudioLevel: () => 0.5,
}));

test('renders stop button and listening text', () => {
    const { getByTestId, getByText } = render(<HomeRecordingScreen />);
    expect(getByTestId('btn-stop-recording')).toBeTruthy();
    expect(getByText(/listening/i)).toBeTruthy();
});
