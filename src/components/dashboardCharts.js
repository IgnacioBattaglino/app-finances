// Barrel de los dos componentes que usan Recharts en Inicio. Dashboard.jsx
// los carga los dos a través de ESTE único import() dinámico (dos llamadas a
// lazy(), mismo specifier) para que terminen en un solo chunk diferido —
// Recharts pesa demasiado para el bundle principal, y no tiene sentido
// bajarlo dos veces si el usuario ya scrolleó hasta ver ambos gráficos.
export { default as PortfolioEvolutionChart } from './PortfolioEvolutionChart.jsx'
export { default as ExpensesBlock } from './ExpensesBlock.jsx'
