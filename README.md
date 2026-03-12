# gapAR | Inventory Intelligence Suite 📦

**gapAR** es una herramienta de Business Intelligence (Single Page Application) diseñada para equipos de Supply Chain y E-commerce. Permite auditar la salud del catálogo, proyectar quiebres de stock y detectar capital inmovilizado procesando reportes de ventas sin necesidad de un backend.

[🚀 Ver Live Demo](https://shishoftw.github.io/gapAR-Inventory-Intelligence-Suite/)

## 🎯 El Problema de Negocio
Las empresas de retail suelen tomar decisiones de compras basadas en la intuición o mirando solo la facturación (dejando de lado el nivel de stock y la velocidad de rotación). Esto genera dos problemas carísimos:
1. **Quiebre de Stock (Stockout):** Quedarse sin los productos que más facturan (Categoría A).
2. **Capital Inmovilizado:** Dinero congelado en depósitos por comprar productos que no rotan.

## 💡 La Solución (gapAR)
Al subir hasta 3 meses de reportes históricos de ventas, el motor en JavaScript consolida los datos y ejecuta un diagnóstico táctico en segundos:
* **Matriz ABC (Pareto):** Clasifica automáticamente el catálogo priorizando los SKUs que generan el 80% de los ingresos.
* **Forecast a 30 Días:** Proyecta la velocidad de venta y cruza los datos con el stock físico actual.
* **Centro de Acción Logística:** Genera alertas automáticas para: "Comprar Ya" (Riesgo de quiebre) y "Congelar Compra" (Sobre stock / +180 días de cobertura).

## 🛠️ Arquitectura Técnica
* **Frontend:** HTML5, CSS3 (CSS Variables, CSS Grid, Glassmorphism UI).
* **Lógica & Procesamiento:** Vanilla JavaScript (ES6+).
* **Librerías:** * `SheetJS`: Para el parseo y consolidación de archivos `.xls` y `.csv` en el navegador del cliente (Zero-Backend, 100% privacidad de datos).
    * `Chart.js`: Para la visualización de la curva de Pareto y distribución de coberturas.

## 🧪 Cómo probarlo
Dado que la herramienta procesa datos en el navegador, podés probarla sin instalar nada:
1. Entrá al [Live Demo](LINK_A_TU_GITHUB_PAGES).
2. Descargá el [Set de Datos de Prueba](./datos_de_prueba) incluido en este repositorio (datos anonimizados).
3. Subí los archivos a la interfaz y ejecutá el diagnóstico.
