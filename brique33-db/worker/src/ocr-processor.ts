// worker/src/ocr-processor.ts
import Tesseract from 'tesseract.js';

export interface OCRResult {
    text: string;
    confidence: number;
    fields: {
        [key: string]: string;
    };
    names: string[]; // Propriété manquante ajoutée
}

export async function runOCR(imageBuffer: Buffer): Promise<OCRResult> {
    try {
        const { data } = await Tesseract.recognize(imageBuffer, 'fra+eng', {
            logger: m => console.log(m)
        });

        const fields = extractFieldsFromText(data.text);
        const names = extractNamesFromText(data.text);

        return {
            text: data.text,
            confidence: data.confidence,
            fields,
            names // Ajout de la propriété manquante
        };
    } catch (error) {
        console.error('OCR processing failed:', error);
        throw error;
    }
}

function extractFieldsFromText(text: string): { [key: string]: string } {
    const fields: { [key: string]: string } = {};

    // Extraction des patterns communs dans les documents
    const patterns = {
        name: /(?:nom|name)[\s:]*([a-zA-Z\s]+)/i,
        firstName: /(?:prénom|firstname)[\s:]*([a-zA-Z\s]+)/i,
        dateOfBirth: /(?:naissance|birth)[\s:]*([0-9]{2}[\/\-][0-9]{2}[\/\-][0-9]{4})/i,
        documentNumber: /(?:numéro|number)[\s:]*([A-Z0-9]+)/i,
        issueDate: /(?:délivré|issued)[\s:]*([0-9]{2}[\/\-][0-9]{2}[\/\-][0-9]{4})/i,
        expiryDate: /(?:expire|expiry)[\s:]*([0-9]{2}[\/\-][0-9]{2}[\/\-][0-9]{4})/i,
        nationality: /(?:nationalité|nationality)[\s:]*([a-zA-Z\s]+)/i
    };

    for (const [field, pattern] of Object.entries(patterns)) {
        const match = text.match(pattern);
        if (match) {
            fields[field] = match[1].trim();
        }
    }

    return fields;
}

function extractNamesFromText(text: string): string[] {
    const names: string[] = [];

    // Extraire le nom complet
    const fullNamePattern = /(?:nom|name)[\s:]*([a-zA-Z\s]+)/i;
    const fullNameMatch = text.match(fullNamePattern);
    if (fullNameMatch) {
        names.push(fullNameMatch[1].trim());
    }

    // Extraire le prénom
    const firstNamePattern = /(?:prénom|firstname)[\s:]*([a-zA-Z\s]+)/i;
    const firstNameMatch = text.match(firstNamePattern);
    if (firstNameMatch) {
        names.push(firstNameMatch[1].trim());
    }

    // Extraire les mots en majuscules (potentiellement des noms)
    const uppercaseWords = text.match(/\b[A-Z][A-Z]+\b/g) || [];
    names.push(...uppercaseWords);

    // Filtrer les doublons et les mots trop courts
    const uniqueNames = [...new Set(names)]
        .filter(name => name.length > 2)
        .filter(name => !['REPUBLIQUE', 'REPUBLIC', 'FRANCAISE', 'FRANCE', 'ID', 'PASSEPORT', 'PASSPORT'].includes(name.toUpperCase()));

    return uniqueNames;
}

// Fonction utilitaire pour valider la qualité OCR
export function validateOCRResult(result: OCRResult): boolean {
    return result.confidence > 60 && result.text.length > 10;
}