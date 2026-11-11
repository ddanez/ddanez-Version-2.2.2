
import { GoogleGenAI, Type } from "@google/genai";
import { Sale, Customer, AppSettings } from "../types";

export interface ExtractedDebt {
  customerName: string;
  amountUSD: number;
  date: string;
  description: string;
}

export class PDFImportService {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async extractDebtsFromPDF(base64Data: string): Promise<ExtractedDebt[]> {
    const model = "gemini-3-flash-preview";
    
    const response = await this.ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: "Analiza este reporte de cuentas por cobrar (CXC) y extrae una lista de deudas pendientes. " +
                    "Para cada deuda, identifica el nombre del cliente, el monto en USD (o la moneda principal), la fecha y una breve descripción si está disponible. " +
                    "Responde estrictamente en formato JSON."
            },
            {
              inlineData: {
                data: base64Data,
                mimeType: "application/pdf"
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              customerName: { type: Type.STRING, description: "Nombre del cliente" },
              amountUSD: { type: Type.NUMBER, description: "Monto adeudado en USD" },
              date: { type: Type.STRING, description: "Fecha de la deuda (YYYY-MM-DD)" },
              description: { type: Type.STRING, description: "Descripción o número de factura" }
            },
            required: ["customerName", "amountUSD", "date"]
          }
        }
      }
    });

    try {
      const text = response.text;
      if (!text) return [];
      return JSON.parse(text) as ExtractedDebt[];
    } catch (error) {
      console.error("Error parsing Gemini response:", error);
      return [];
    }
  }

  static async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  }
}
