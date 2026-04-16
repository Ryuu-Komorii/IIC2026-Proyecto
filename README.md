# Valorant InfoVis

Visualización web estática de los agentes más elegidos de Valorant entre 2021 y 2025.

## Estructura

- `index.html`
- `styles.css`
- `script.js`
- `db/agents_pick_rates_2021.csv` a `db/agents_pick_rates_2025.csv`
- `assets/` para los PNG de agentes

## Cómo usarlo

1. Abre la carpeta en un servidor local.
   - VS Code + Live Server
   - `python -m http.server`
2. Asegúrate de tener los PNG de agentes en `assets/`.
3. Abre `index.html`.

## Criterio de agregación

Para cada año se usan primero las filas con:
- `Stage = All Stages`
- `Match Type = All Match Types`
- `Map = All Maps`

Si esas filas no existen, el script cae en un promedio general sobre el archivo completo.
