import { loadFileAsDataUrl } from '../lib/utils'

type Props = {
  label: string
  value: string
  onUrlChange: (value: string) => void
  accept?: string
}

export function FilePicker({ label, value, onUrlChange, accept = 'image/*' }: Props) {
  const id = `file-${label.replace(/\s+/g, '-').toLowerCase()}`

  return (
    <div className="field">
      <label className="label">{label}</label>
      <div className="row">
        <input
          className="input"
          value={value}
          onChange={(event) => onUrlChange(event.target.value)}
          placeholder={accept.includes('pdf') ? 'Paste a file URL or upload PNG, JPG, or PDF' : 'Paste an image URL or upload a file'}
        />
        <label htmlFor={id} className="button button-outline">
          File
        </label>
        <input
          id={id}
          type="file"
          accept={accept}
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            onUrlChange(await loadFileAsDataUrl(file))
            event.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
