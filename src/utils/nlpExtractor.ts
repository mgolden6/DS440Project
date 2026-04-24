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
    'mg': 0.001, 'milligram': 0.001, 'milligrams': 0.001,
    'kg': 1000, 'kilogram': 1000, 'kilograms': 1000,
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
    'mg': 'mg', 'milligram': 'mg', 'milligrams': 'mg',
    'kg': 'kg', 'kilogram': 'kg', 'kilograms': 'kg',
    'lb': 'lb', 'pound': 'lb', 'pounds': 'lb',
    'slice': 'slice', 'slices': 'slice',
    'piece': 'piece', 'pieces': 'piece',
};

const NUMBER_WORDS: Record<string, number> = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'half': 0.5, 'quarter': 0.25, 'third': 0.33, 'fourth': 0.25, 'fifth': 0.2,
    'a': 1, 'an': 1, 'point': 0, 'dot': 0, 'zero': 0
};

export function segmentMeal(utterance: string): ExtractionResult {
    const lower = utterance.toLowerCase().trim();
    if (!lower || lower.length < 3) return { segments: [], glucose: null, confidence: 0 };

    const segments: FoodSegment[] = [];
    let glucose: number | null = null;

    // 1. Extract glucose
    const glucoseMatch = lower.match(/(?:glucose|sugar|level)\s+(?:is\s+)?(\d+)/) || lower.match(/(\d+)\s+(?:mg\/dl|mgdl)/);
    if (glucoseMatch) glucose = parseInt(glucoseMatch[1]);

    // Strip the glucose phrase entirely so it doesn't leave dangling words like "my"
    let processingString = lower.replace(/\b(?:my\s+)?(?:blood\s+)?(?:glucose|sugar|level)\s+(?:is\s+)?\d+\s*(?:mg\/dl|mgdl)?\b/gi, '')
                                .replace(/\b\d+\s+(?:mg\/dl|mgdl)\b/gi, '');

    // 2. Clear Delimiters: split by 'and', ',', 'with'
    const delimiterPattern = /\s+and\s+|,|\s+with\s+/gi;
    let initialParts = processingString.split(delimiterPattern).map(p => p.trim()).filter(p => p.length > 2);

    // 3. Pre-process "of" and articles: e.g. "3 / 4 of a banana" -> "3/4 banana", "half a banana" -> "half banana"
    initialParts = initialParts.map(part => {
        // Handle "point 5", "point five", "zero point five" -> "0.5"
        let cleaned = part.replace(/\b(?:zero\s+)?(?:point|dot)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, (match, p1) => {
            const val = NUMBER_WORDS[p1.toLowerCase()] ?? p1;
            return `0.${val}`;
        });
        
        // Handle "half of a", "1/4 of a", etc. (allow spaces around slash)
        // GLOBAL flag is critical here to handle multiple items in one segment
        cleaned = cleaned.replace(/((?:\d+(?:\s*\/\s*\d+|\.\d+)?|\.\d+)|one|two|three|four|five|six|seven|eight|nine|ten|half|third|quarter|fourth|fifth)\s+of\b\s*(?:a|an|the|some)?\s*/gi, (match, p1) => {
            // Normalize fraction by removing spaces
            return p1.replace(/\s+/g, '') + ' ';
        });
        
        // Handle "half a", "quarter an", etc. to prevent splitting on the article later
        cleaned = cleaned.replace(/\b(half|third|quarter|fourth|fifth)\s+(?:a|an|the|some)\b\s*/gi, '$1 ');
        
        // Handle "a half", "a quarter", etc. (leading article)
        cleaned = cleaned.replace(/\b(?:a|an|the|some)\s+(half|third|quarter|fourth|fifth)\b\s*/gi, '$1 ');
        
        return cleaned;
    });

    // 4. Refining segments: look for numbers, articles or fractions that aren't at the start and split there too
    // Supports decimals with leading points (e.g. .75) and fractions with spaces (e.g. 1 / 4)
    // IMPORTANT: must use \b on both sides for words to avoid matching 'a' in 'banana'
    const numberPattern = /(?:\b\d+(?:\s*\/\s*\d+|\.\d+)?|\.\d+)\b|\b(one|two|three|four|five|six|seven|eight|nine|ten|half|third|quarter|fourth|fifth|a|an|some)\b/gi;
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

        let nameOnly = cleaned;

        // 2. Aggressive Filler & Article Stripping
        // Strips "i had", "i ate", "i've had", "having", etc.
        const fillerPrefixes = /^(i\s+had|i\s+ate|i've\s+had|i've\s+eaten|i\s+am\s+having|having|ate|had|of|and)(?:\s+|$)/i;
        const articlePrefixes = /^(?:a|an|some|the)(?:\s+|$)/i;

        nameOnly = nameOnly.replace(fillerPrefixes, '').replace(articlePrefixes, '').trim();

        // Skip if empty or simple filler
        if (nameOnly.length < 2) continue;

        // Support digits with possible leading dots and spaces in fractions
        const numRegex = /(?:\d+(?:\s*\/\s*\d+|\.\d+)?|\.\d+)/;
        const fractionMatch = nameOnly.match(/^(half|quarter|third|fourth|fifth)\s+(?:a\s+)?(.+)/);
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
            // Check if it starts with a unit even without an explicit number (e.g. "teaspoon of salt" -> implies 1 teaspoon)
            const unitKeys = Object.keys(UNIT_ML).join('|');
            const unitPattern = new RegExp(`^(${unitKeys})\\s+(?:of\\s+)?(.+)$`, 'i');
            const unitMatch = nameOnly.match(unitPattern);
            if (unitMatch) {
                const unitKey = unitMatch[1].toLowerCase();
                const foodName = unitMatch[2].trim();
                const mlPerUnit = UNIT_ML[unitKey] ?? 100;
                segments.push({
                    quantity: 1,
                    name: foodName,
                    originalText: cleaned,
                    gramsOverride: 1 * mlPerUnit,
                    unit: UNIT_CANONICAL[unitKey] ?? unitKey,
                });
            } else {
                segments.push({
                    quantity: 1,
                    name: nameOnly,
                    originalText: cleaned
                });
            }
        }
    }

    let confidence = segments.length > 0 ? 0.9 : 0.1;
    if (segments.length === 1 && segments[0].name.split(' ').length === 1) confidence = 0.3;

    return { segments, glucose, confidence };
}
