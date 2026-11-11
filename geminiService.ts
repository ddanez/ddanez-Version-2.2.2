
export const analyzeFinancialData = async (data: any) => {
  const token = localStorage.getItem('auth_token');
  
  if (!token) {
    return "Error: No se ha detectado una sesión activa. Por favor, inicia sesión de nuevo.";
  }

  const prompt = `
    Eres un experto analista financiero para pequeños negocios. 
    Analiza los siguientes datos financieros de un negocio llamado "D'Danez Gestor Pro".
    Los datos incluyen ventas, compras de inventario (costo de inversión) y gastos operativos (alquiler, servicios, etc.).
    
    ${data.periodo ? `
    IMPORTANTE: El análisis debe enfocarse en el PERIODO DE TIEMPO seleccionado:
    - Desde: ${data.periodo.desde}
    - Hasta: ${data.periodo.hasta}
    
    Datos del periodo:
    - Ventas totales (Ventas directas): ${data.resumen.totalVentas} ($${data.resumen.ingresosUSD.toFixed(2)})
    - Obsequios/Cortesías: ${data.resumen.totalObsequios} ($${data.resumen.obsequiosUSD.toFixed(2)})
    - Consumo interno: ${data.resumen.totalConsumos} ($${data.resumen.consumosUSD.toFixed(2)})
    - Merma (Pérdida de inventario): ${data.resumen.totalMerma} registros ($${data.resumen.mermaUSD.toFixed(2)})
    - Compras totales: ${data.resumen.totalCompras} ($${data.resumen.costoInversionUSD.toFixed(2)})
    - Gastos operativos: ${data.resumen.totalGastosOperativos} ($${data.resumen.gastosOperativosUSD.toFixed(2)})
    
    Por favor, proporciona un análisis detallado de la rentabilidad y el rendimiento del negocio específicamente para este rango de fechas. 
    Asegúrate de considerar el impacto de la merma, los obsequios y el consumo interno en la utilidad neta.
    ` : `
    Proporciona:
    1. Un resumen ejecutivo del estado financiero actual.
    2. Análisis de rentabilidad (Ingresos vs Egresos Totales).
    3. Identificación de tendencias en ventas y gastos.
    4. 3 recomendaciones estratégicas para mejorar la utilidad neta.
    `}
    
    Responde en formato Markdown, con un tono profesional pero motivador. 
    Usa emojis para resaltar puntos clave.
    Menciona específicamente la "Utilidad Neta" (Ingresos - Compras - Gastos).
  `;

  try {
    console.log("🤖 Solicitando análisis al servidor...");
    const response = await fetch('/api/ai/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ prompt, data })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Error en la respuesta del servidor');
    }

    const result = await response.json();
    console.log("✅ Análisis completado exitosamente.");
    return result.text;
  } catch (error: any) {
    console.error("❌ Error al analizar datos con el servidor:", error);
    return `Lo siento, no pude realizar el análisis en este momento. ${error.message || 'Por favor, intenta más tarde.'}`;
  }
};
