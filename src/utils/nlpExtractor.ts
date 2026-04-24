export interface FoodSegment {
    name: string;
    quantity: number;
    originalText: string;
    /** If a volume/weight unit was stated (e.g. 'cups'), total grams for the stated quantity */
    gramsOverride?: number;
    unit?: string;
}

export interface ExtractionResult {
    segments: FoodSegment[];
    glucose: number | null;
    confidence: number;
}

/** Common volume/weight units → mL or g per 1 unit */
const UNIT_ML: Record<string, number> = {
    'cup': 240, 'cups': 240,
    'oz': 29.5, 'ounce': 29.5, 'ounces': 29.5, 'fl oz': 29.5,
    'tbsp': 14.8, 'tablespoon': 14.8, 'tablespoons': 14.8,
    'tsp': 4.9, 'teaspoon': 4.9, 'teaspoons': 4.9,
    'ml': 1, 'milliliter': 1, 'milliliters': 1,
    'l': 1000, 'liter': 1000, 'liters': 1000,
    'g': 1, 'gram': 1, 'grams': 1,
    'lb': 453.6, 'pound': 453.6, 'pounds': 453.6,
    'slice': 28, 'slices': 28,
    'piece': 100, 'pieces': 100,
};

/** Canonical unit name for display */
const UNIT_CANONICAL: Record<string, string> = {
    'cup': 'cup', 'cups': 'cup',
    'oz': 'oz', 'ounce': 'oz', 'ounces': 'oz', 'fl oz': 'oz',
    'tbsp': 'tbsp', 'tablespoon': 'tbsp', 'tablespoons': 'tbsp',
    'tsp': 'tsp', 'teaspoon': 'tsp', 'teaspoons': 'tsp',
    'ml': 'ml', 'milliliter': 'ml', 'milliliters': 'ml',
    'l': 'l', 'liter': 'l', 'liters': 'l',
    'g': 'g', 'gram': 'g', 'grams': 'g',
    'lb': 'lb', 'pound': 'lb', 'pounds': 'lb',
    'slice': 'slice', 'slices': 'slice',
    'piece': 'piece', 'pieces': 'piece',
};

const NUMBER_WORDS: Record<string, number> = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'half': 0.5, 'quarter': 0.25, 'third': 0.33, 'a': 1, 'an': 1
};

export function segmentMeal(utterance: string): ExtractionResult {
    const lower = utterance.toLowerCase().trim();
    if (!lower || lower.length < 3) return { segments: [], glucose: null, confidence: 0 };

    const segments: FoodSegment[] = [];
    let glucose: number | null = null;

    // 1. Extract glucose
    const glucoseMatch = lower.match(/(?:glucose|sugar|level)\s+(?:is\s+)?(\d+)/) || lower.match(/(\d+)\s+(?:mg\/dl|mgdl)/);
    if (glucoseMatch) glucose = parseInt(glucoseMatch[1]);

    // 2. Clear Delimiters: split by 'and', ',', 'with'
    const delimiterPattern = /\s+and\s+|,|\s+with\s+/gi;
    let initialParts = lower.split(delimiterPattern).map(p => p.trim()).filter(p => p.length > 2);

    // 3. Pre-process "of": e.g. "3/4 of a banana" -> "3/4 banana"
    // Supports decimals with leading dots
    initialParts = initialParts.map(part => {
        return part.replace(/((?:\d+(?:\/\d+|\.\d+)?|\.\d+)|one|two|three|four|five|six|seven|eight|nine|ten)\s+of\b\s*(?:a|an|the)?\s*/i, '$1 ');
    });

    // 4. Refining segments: look for numbers or articles that aren't at the start and split there too
    // Supports decimals with leading points (e.g. .75)
    const numberPattern = /(?:\b\d+(?:\/\d+|\.\d+)?|\.\d+)\b|(?:one|two|three|four|five|six|seven|eight|nine|ten|a|an|some)\b/gi;
    const finalParts: string[] = [];

    for (const part of initialParts) {
        let matches;
        let lastIndex = 0;
        const subParts: string[] = [];

        while ((matches = numberPattern.exec(part)) !== null) {
            if (matches.index > 0) {
                subParts.push(part.substring(lastIndex, matches.index).trim());
                lastIndex = matches.index;
            }
        }
        subParts.push(part.substring(lastIndex).trim());
        finalParts.push(...subParts.filter(p => p.length > 2));
    }

    for (const part of finalParts) {
        let cleaned = part.trim();

        // 1. Remove glucose part if it exists in the segment
        let nameOnly = cleaned.replace(/(?:glucose|sugar|level)\s+(?:is\s+)?\d+/, '').replace(/\d+\s+(?:mg\/dl|mgdl)/, '').trim();

        // 2. Aggressive Filler & Article Stripping
        // Strips "i had", "i ate", "i've had", "having", etc.
        const fillerPrefixes = /^(i\s+had|i\s+ate|i've\s+had|i've\s+eaten|i\s+am\s+having|having|ate|had)(?:\s+|$)/i;
        const articlePrefixes = /^(?:a|an|some|the)(?:\s+|$)/i;

        nameOnly = nameOnly.replace(fillerPrefixes, '').replace(articlePrefixes, '').trim();

        // Skip if empty or simple filler
        if (nameOnly.length < 2) continue;

        // Support digits with possible leading dots
        const numRegex = /(?:\d+(?:\/\d+|\.\d+)?|\.\d+)/;
        const fractionMatch = nameOnly.match(/^(half|quarter|third)\s+(?:a\s+)?(.+)/);
        const qtyPattern = new RegExp(`^(${numRegex.source})\\s+(.+)`);
        const qtyMatch = nameOnly.match(qtyPattern);
        const wordMatch = nameOnly.match(/^(one|two|three|four|five|six|seven|eight|nine|ten)\s+(.+)/);

        if (fractionMatch) {
            segments.push({
                quantity: NUMBER_WORDS[fractionMatch[1]],
                name: fractionMatch[2].trim(),
                originalText: cleaned
            });
        } else if (qtyMatch) {
            const rawQty = qtyMatch[1].trim();
            let qty = 1;
            if (rawQty.includes('/')) {
                const [num, den] = rawQty.split('/').map(Number);
                qty = num / den;
            } else {
                qty = parseFloat(rawQty);
            }
            // Check if next token is a volume/weight unit (e.g. "2 cups of orange juice")
            const unitKeys = Object.keys(UNIT_ML).join('|');
            const unitPattern = new RegExp(`^(${unitKeys})\\s+(?:of\\s+)?(.+)$`, 'i');
            const unitMatch = qtyMatch[2].trim().match(unitPattern);
            if (unitMatch) {
                const unitKey = unitMatch[1].toLowerCase();
                const foodName = unitMatch[2].trim();
                const mlPerUnit = UNIT_ML[unitKey] ?? 100;
                segments.push({
                    quantity: qty,
                    name: foodName,
                    originalText: cleaned,
                    gramsOverride: qty * mlPerUnit,  // total grams/ml for this segment
                    unit: UNIT_CANONICAL[unitKey] ?? unitKey,
                });
            } else {
                segments.push({
                    quantity: qty,
                    name: qtyMatch[2].trim(),
                    originalText: cleaned
                });
            }
        } else if (wordMatch) {
            // Same unit detection for word-number matches
            const wordQty = NUMBER_WORDS[wordMatch[1]];
            const unitKeys = Object.keys(UNIT_ML).join('|');
            const unitPattern = new RegExp(`^(${unitKeys})\\s+(?:of\\s+)?(.+)$`, 'i');
            const unitMatch = wordMatch[2].trim().match(unitPattern);
            if (unitMatch) {
                const unitKey = unitMatch[1].toLowerCase();
                const foodName = unitMatch[2].trim();
                const mlPerUnit = UNIT_ML[unitKey] ?? 100;
                segments.push({
                    quantity: wordQty,
                    name: foodName,
                    originalText: cleaned,
                    gramsOverride: wordQty * mlPerUnit,
                    unit: UNIT_CANONICAL[unitKey] ?? unitKey,
                });
            } else {
                segments.push({
                    quantity: wordQty,
                    name: wordMatch[2].trim(),
                    originalText: cleaned
                });
            }
        } else {
            segments.push({
                quantity: 1,
                name: nameOnly,
                originalText: cleaned
            });
        }
    }

    let confidence = segments.length > 0 ? 0.9 : 0.1;
    if (segments.length === 1 && segments[0].name.split(' ').length === 1) confidence = 0.3;

    return { segments, glucose, confidence };
}
