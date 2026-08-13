import { useEffect, useCallback } from 'react'
import { Checkbox, Button, Popconfirm, Input, Modal, message, theme, Tooltip, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import { DeleteOutlined, EditOutlined, ArrowUpOutlined, ArrowDownOutlined, CopyOutlined, LinkOutlined } from '@ant-design/icons'
import { submitOnEnter, renderMarkdown, handleLinkPaste } from '../utils'
import { AutoFocusInput } from './AutoFocusInput'
import { useAppContext } from '../context/AppContext'
import SortableRow from './SortableRow'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'

interface Props {
  problems: ProblemItem[]
  onRefresh: () => void
  showReorder?: boolean
  highlightedId?: number | null
  onHighlightDone?: () => void
  highlightKey?: number
  selectMode?: boolean
  selectedIds?: Set<number>
  onToggleSelect?: (id: number) => void
}

export default function ProblemList({ problems, onRefresh, showReorder = true, highlightedId, onHighlightDone, highlightKey, selectMode, selectedIds, onToggleSelect }: Props): JSX.Element {
  const { token } = theme.useToken()
  const { isDark, bumpDataVersion } = useAppContext()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    if (highlightedId == null) return
    const el = document.getElementById(`problem-${highlightedId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = setTimeout(() => {
      onHighlightDone?.()
    }, 1500)
    return () => clearTimeout(timer)
  }, [highlightedId, highlightKey])

  const handleToggle = async (id: number) => {
    await window.api.problem.toggle({ id })
    bumpDataVersion()
    onRefresh()
  }

  const handleDelete = async (id: number) => {
    await window.api.problem.delete({ id })
    message.success('已删除')
    bumpDataVersion()
    onRefresh()
  }

  const handleEdit = (id: number) => {
    let newName = ''
    const problem = problems.find(p => p.id === id)
    Modal.confirm({
      title: '修改题目',
      autoFocusButton: null,
      content: (
        <AutoFocusInput
          defaultValue={problem?.name}
          onChange={e => { newName = e.target.value }}
          onKeyDown={submitOnEnter}
          onPaste={handleLinkPaste}
        />
      ),
      onOk: async () => {
        if (!newName.trim()) return
        await window.api.problem.update({ id, name: newName.trim() })
        bumpDataVersion()
        message.success('已修改')
        onRefresh()
      }
    })
  }

  const handleMoveUp = async (index: number) => {
    if (index === 0) return
    const items = problems.map((p, i) => ({
      id: p.id,
      sortOrder: i === index ? index - 1 : i === index - 1 ? index : i
    }))
    await window.api.problem.reorder({ items })
    bumpDataVersion()
    onRefresh()
  }

  const handleMoveDown = async (index: number) => {
    if (index === problems.length - 1) return
    const items = problems.map((p, i) => ({
      id: p.id,
      sortOrder: i === index ? index + 1 : i === index + 1 ? index : i
    }))
    await window.api.problem.reorder({ items })
    bumpDataVersion()
    onRefresh()
  }

  const handleCopy = async (problem: ProblemItem) => {
    await navigator.clipboard.writeText(problem.name)
    message.success('已复制到剪贴板')
  }

  const extractId = (name: string): string | null => {
    const trimmed = name.replace(/[\s\u200B-\u200D\uFEFF]+$/, '')
    const match = trimmed.match(/\(([^)]*)\)$/)
    if (!match) return null
    const inner = match[1]
    const linkMatch = inner.match(/\[([^\]]*)\]\(([^)]+)\)/)
    return linkMatch ? linkMatch[2] : inner
  }

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = problems.findIndex(p => p.id === active.id)
    const newIndex = problems.findIndex(p => p.id === over.id)
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return
    window.api.problem.reorder({ items: arrayMove(problems, oldIndex, newIndex).map((p, i) => ({ id: p.id, sortOrder: i })) })
    bumpDataVersion()
    onRefresh()
  }, [problems, bumpDataVersion, onRefresh])

  const applySort = async (mode: 'name-asc' | 'name-desc' | 'time-asc' | 'time-desc' | 'manual') => {
    const dir = (mode === 'name-asc' || mode === 'time-asc') ? 1 : -1
    const sorted = [...problems].sort((a, b) => {
      if (mode === 'manual') return a.sort_order - b.sort_order
      if (mode === 'name-asc' || mode === 'name-desc') {
        return a.name.localeCompare(b.name, 'zh-Hans-CN') * dir
      }
      return (a.created_at || '').localeCompare(b.created_at || '') * dir
    })
    await window.api.problem.reorder({ items: sorted.map((p, i) => ({ id: p.id, sortOrder: i })) })
    bumpDataVersion()
    onRefresh()
  }

  const sortMenu: MenuProps['items'] = [
    { key: 'name-asc', label: '按名称 A-Z' },
    { key: 'name-desc', label: '按名称 Z-A' },
    { key: 'time-asc', label: '按创建时间 旧→新' },
    { key: 'time-desc', label: '按创建时间 新→旧' },
    { type: 'divider' as const },
    { key: 'manual', label: '恢复拖拽顺序' },
  ]

  return (
    <>
      <style>{`
        .select-mode .ant-checkbox-inner { border-color: #fa8c16 !important; }
        .select-mode.ant-checkbox-wrapper-checked .ant-checkbox-inner { background-color: #fa8c16 !important; border-color: #fa8c16 !important; }
        .select-mode.ant-checkbox-wrapper-checked .ant-checkbox-inner::after { border-color: #fff !important; }
      `}</style>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={problems.map(p => p.id)} strategy={verticalListSortingStrategy}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {problems.map((problem, index) => {
              const isHighlighted = highlightedId === problem.id
              const idContent = extractId(problem.name)
              const menuItems: MenuProps['items'] = [
                { key: 'edit', label: '编辑', icon: <EditOutlined />, onClick: () => handleEdit(problem.id) },
                { key: 'copy', label: '复制题目', icon: <CopyOutlined />, onClick: () => handleCopy(problem) },
                { key: 'copy-id', label: idContent ? '复制题号' : '无题号', icon: <LinkOutlined />, disabled: !idContent, onClick: () => { if (idContent) { navigator.clipboard.writeText(idContent); message.success('已复制') } } },
                { type: 'divider' as const },
                showReorder ? { key: 'up', label: '上移', icon: <ArrowUpOutlined />, disabled: index === 0, onClick: () => handleMoveUp(index) } : null,
                showReorder ? { key: 'down', label: '下移', icon: <ArrowDownOutlined />, disabled: index === problems.length - 1, onClick: () => handleMoveDown(index) } : null,
                { type: 'divider' as const },
                { key: 'delete', label: '删除', danger: true, onClick: () => { Modal.confirm({ title: '确认删除此题？', okText: '删除', okType: 'danger', onOk: () => handleDelete(problem.id) }) } },
                { type: 'divider' as const },
                { key: 'sort', label: '排序当前区域', children: sortMenu.map(item => ({ ...item, onClick: () => applySort(item.key as 'name-asc' | 'name-desc' | 'time-asc' | 'time-desc' | 'manual') })) },
              ].filter(Boolean)
              return (
                <Dropdown key={problem.id} menu={{ items: menuItems }} trigger={['contextMenu']}>
                  <div
                    id={`problem-${problem.id}`}
                    onContextMenu={e => e.stopPropagation()}
                    style={{
                      background: isHighlighted ? token.colorPrimaryBg : problem.completed ? (isDark ? 'rgba(76, 175, 80, 0.12)' : token.colorSuccessBg) : undefined,
                      transition: 'background-color 0.5s',
                      borderRadius: 6
                    }}
                  >
                    <SortableRow
                      id={problem.id}
                      disabled={!!selectMode}
                      isDark={isDark}
                      checked={selectedIds?.has(problem.id) ?? false}
                      onCheckChange={v => onToggleSelect?.(problem.id)}
                      actions={
                        <>
                          {showReorder && (
                            <>
                              <Tooltip title="上移">
                                <Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => handleMoveUp(index)} />
                              </Tooltip>
                              <Tooltip title="下移">
                                <Button type="text" size="small" icon={<ArrowDownOutlined />} disabled={index === problems.length - 1} onClick={() => handleMoveDown(index)} />
                              </Tooltip>
                            </>
                          )}
                          <Tooltip title={idContent ? '复制题号' : '无题号'}>
                            <Button
                              type="text"
                              size="small"
                              icon={<LinkOutlined />}
                              disabled={!idContent}
                              style={{ opacity: idContent ? 1 : 0.25, color: idContent ? undefined : token.colorTextQuaternary }}
                              onClick={() => {
                                if (idContent) {
                                  navigator.clipboard.writeText(idContent)
                                  message.success('已复制')
                                }
                              }}
                            />
                          </Tooltip>
                          <Tooltip title="编辑">
                            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(problem.id)} />
                          </Tooltip>
                          <Tooltip title="复制题目">
                            <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => handleCopy(problem)} />
                          </Tooltip>
                          <Popconfirm title="确认删除此题？" onConfirm={() => handleDelete(problem.id)}>
                            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </>
                      }
                    >
                      <Checkbox
                        checked={selectMode ? (selectedIds?.has(problem.id) ?? false) : !!problem.completed}
                        onChange={() => selectMode ? onToggleSelect?.(problem.id) : handleToggle(problem.id)}
                        className={selectMode ? 'select-mode' : ''}
                        style={{ textDecoration: problem.completed ? 'line-through' : 'none', color: problem.completed ? token.colorTextTertiary : undefined }}
                      >
                        {renderMarkdown(problem.name, isDark)}
                      </Checkbox>
                    </SortableRow>
                  </div>
                </Dropdown>
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
    </>
  )
}
