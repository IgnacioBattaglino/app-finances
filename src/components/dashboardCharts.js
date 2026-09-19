// Barrel de los componentes que usan Recharts. Cada pantalla que los usa los
// carga a través de ESTE mismo import() dinámico (un lazy() propio por
// pantalla, mismo specifier) para que terminen todos en un solo chunk
// diferido -- Recharts pesa demasiado para el bundle principal, y no tiene
// sentido bajarlo dos veces porque dos pantallas distintas lo pidan.
export { default as PortfolioEvolutionChart } from './PortfolioEvolutionChart.jsx'
export { default as ExpensesYearChart } from './ExpensesYearChart.jsx'
