interface SegOption<T extends string> {
  id: T
  cap: string
}

interface SegProps<T extends string> {
  options: ReadonlyArray<SegOption<T>>
  value: T
  onChange: (next: T) => void
}

export function Seg<T extends string>({ options, value, onChange }: SegProps<T>) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          className={`seg__opt ${value === o.id ? 'seg__opt--on' : ''}`}
          onClick={() => onChange(o.id)}
          type="button"
        >
          {o.cap}
        </button>
      ))}
    </div>
  )
}
