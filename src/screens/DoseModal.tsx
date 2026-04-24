import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useFlowStore } from '@/store/flowStore';
import { useSettingsStore } from '@/store/settingsStore';
import { calculateDose } from '@/utils/insulinCalculator';
import { db } from '@/db';
import { mealLogs, glucoseLogs, doseLogs } from '@/db/schema';

export default function DoseModal() {
    const { finalItems, glucose, icr: icrOverride, resetFlow } = useFlowStore();
    const settings = useSettingsStore();

    const dose = useMemo(() => {

        const totalCarbsG = finalItems.reduce((sum, i) => sum + i.carbsG, 0);
        // Use provided glucose or fallback to target (no correction)
        const glucoseMgDl = glucose || settings.targetGlucose;

        return calculateDose({
            totalCarbsG,
            glucoseMgDl,
            icr: icrOverride || settings.icr,
            isf: settings.isf,
            targetGlucose: settings.targetGlucose,
            isfThreshold: settings.isfThreshold,
            maxDose: settings.maxDose,
            roundingMode: settings.roundingMode,
        });
    }, [finalItems, glucose, icrOverride, settings]);

    const handleConfirm = async () => {
        if (!dose) return;

        try {
            const now = Date.now();

            // Data persistence removed as per user request (Privacy)
            console.log('[DEBUG] Calculation Finished');

            resetFlow();
            router.replace('/');
        } catch (error) {
            console.error('Failed to complete dose:', error);
            Alert.alert('Error', 'An unexpected error occurred.');
        }
    };

    if (!dose) return null;

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Insulin Recommendation</Text>

            <View style={styles.card}>
                <View style={styles.row}>
                    <Text style={styles.label}>Meal Dose</Text>
                    <Text style={styles.value}>{dose.mealDose.toFixed(2)} U</Text>
                </View>
                <View style={styles.row}>
                    <Text style={styles.label}>Correction Dose</Text>
                    <Text style={styles.value}>{dose.correctionDose.toFixed(2)} U</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.totalRow}>
                    <View>
                        <Text style={styles.labelTotal}>Total Dose</Text>
                        {settings.roundingMode !== 'none' && (
                            <Text style={styles.subtext}>Rounded to nearest {settings.roundingMode}</Text>
                        )}
                    </View>
                    <Text style={styles.valueTotal}>{dose.totalDose.toFixed(settings.roundingMode === 'none' ? 2 : 1)} U</Text>
                </View>
            </View>

            {dose.isCapped && (
                <View style={styles.warningBox}>
                    <Text style={styles.warningText}>
                        ⚠️ Safety Cap Applied: Dose limited to your maximum of {settings.maxDose} units.
                    </Text>
                </View>
            )}

            {(settings.icr === 10 || settings.isf === 50) && (
                <View style={[styles.warningBox, { borderLeftColor: '#007AFF', backgroundColor: 'rgba(0, 122, 255, 0.1)' }]}>
                    <Text style={[styles.warningText, { color: '#007AFF' }]}>
                        ℹ️ Using default ratios (ICR: {settings.icr}). Personalize in Settings for accuracy.
                    </Text>
                </View>
            )}

            <Text style={styles.disclaimer}>
                ⚠️ NOTICE: Carbs and insulin doses can be wrong. These are suggestions only. Always verify calculations manually before dosing.
            </Text>

            <TouchableOpacity
                style={styles.confirmButton}
                testID="btn-confirm-dose"
                onPress={handleConfirm}
            >
                <Text style={styles.confirmText}>Complete</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => router.push('/settings')}
            >
                <View style={styles.settingsHighlight}>
                    <Text style={styles.cancelText}>Check Settings</Text>
                </View>
            </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#0a0a0a' },
    scrollContent: { flexGrow: 1, padding: 24, justifyContent: 'center' },
    title: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 32, textAlign: 'center' },
    card: { backgroundColor: '#1c1c1e', padding: 24, borderRadius: 20, marginBottom: 24, borderWidth: 1, borderColor: '#2c2c2e' },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
    label: { fontSize: 18, color: '#aaa' },
    value: { fontSize: 18, color: '#fff', fontWeight: 'bold' },
    divider: { height: 1, backgroundColor: '#2c2c2e', marginVertical: 8 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
    labelTotal: { fontSize: 22, color: '#fff', fontWeight: 'bold' },
    subtext: { fontSize: 12, color: '#666', marginTop: 2 },
    valueTotal: { fontSize: 32, color: '#007AFF', fontWeight: 'bold' },
    warningBox: { backgroundColor: 'rgba(255, 149, 0, 0.1)', padding: 16, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: '#FF9500', marginBottom: 24 },
    warningText: { color: '#FF9500', fontWeight: '600', fontSize: 14 },
    disclaimer: {
        fontSize: 11,
        color: '#FF3B30',
        textAlign: 'center',
        marginTop: 8,
        marginBottom: 16,
        paddingHorizontal: 20,
        fontStyle: 'italic',
        lineHeight: 16
    },
    confirmButton: {
        backgroundColor: '#34C759', padding: 20, borderRadius: 16,
        alignItems: 'center', shadowColor: '#34C759', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }
    },
    confirmText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
    cancelButton: { marginTop: 12 },
    cancelText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
    settingsHighlight: {
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#007AFF',
        backgroundColor: 'rgba(0, 122, 255, 0.05)',
        alignItems: 'center'
    }
});
