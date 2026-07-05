function PageHeader({ title, description }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {description && <p className="mt-1 text-[15px] text-ink-soft">{description}</p>}
    </header>
  )
}

export default PageHeader
