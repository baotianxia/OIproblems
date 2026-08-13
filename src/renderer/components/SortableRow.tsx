import { useState } from 'react'
import { Checkbox } from 'antd'
import { HolderOutlined } from '@ant-design/icons'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface Props {
  id: number
  disabled: boolean
  isDark: boolean
  onClick?: () => void
  checked?: boolean
  onCheckChange?: (v: boolean) => void
  actions?: React.ReactNode
  children: React.ReactNode
}

export default function SortableRow({ id, disabled, isDark, onClick, checked, onCheckChange, actions, children }: Props): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const [hover, setHover] = useState(false)
  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        border: `1px solid ${isDark ? '#333' : '#d9d9d9'}`,
        borderRadius: 6,
        background: isDragging ? (isDark ? '#2a2a2a' : '#fafafa') : hover ? (isDark ? '#262626' : '#f5f5f5') : 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
        position: 'relative'
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={e => {
        if ((e.target as HTMLElement).closest('.row-handle')) return
        onClick?.()
      }}
    >
      {disabled ? (
        <span style={{ display: 'inline-flex', justifyContent: 'center', width: 18 }} onClick={e => e.stopPropagation()}>
          <Checkbox checked={checked} onChange={e => onCheckChange?.(e.target.checked)} />
        </span>
      ) : (
        <span
          {...attributes}
          {...listeners}
          className="row-handle"
          style={{ cursor: 'grab', display: 'inline-flex', color: isDark ? '#666' : '#999' }}
        >
          <HolderOutlined />
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {children}
      </span>
      <span style={{ visibility: hover && !disabled ? 'visible' : 'hidden', display: 'inline-flex', gap: 2 }} onClick={e => e.stopPropagation()}>
        {actions}
      </span>
    </div>
  )
}