import { useEffect } from 'react'
import { List, Checkbox, Button, Popconfirm, Input, Modal, message, Space, theme, Tooltip } from 'antd'
import { DeleteOutlined, EditOutlined, ArrowUpOutlined, ArrowDownOutlined, CopyOutlined, LinkOutlined } from '@ant-design/icons'
import { submitOnEnter, renderMarkdown } from '../utils'
import { AutoFocusInput } from './AutoFocusInput'
import { useAppContext } from '../context/AppContext'


interface Props {
  problems: ProblemItem[]
  onRefresh: () => void
  showReorder?: boolean
  highlightedId?: number | null
  onHighlightDone?: () => void
  highlightKey?: number
}

export default function ProblemList({ problems, onRefresh, showReorder = true, highlightedId, onHighlightDone, highlightKey }: Props): JSX.Element {
  const { token } = theme.useToken()
  const { isDark, bumpDataVersion } = useAppContext()

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
    return match ? match[1] : null
  }

  return (
    <List
      dataSource={problems}
      renderItem={(problem, index) => {
        const isHighlighted = highlightedId === problem.id
        const idContent = extractId(problem.name)
        return (
          <List.Item
            id={`problem-${problem.id}`}
            style={{
              padding: '8px 16px',
              background: isHighlighted ? token.colorPrimaryBg : problem.completed ? (isDark ? 'rgba(76, 175, 80, 0.12)' : token.colorSuccessBg) : undefined,
              transition: 'background-color 0.5s'
            }}
            actions={[
              showReorder && (
                <Space key="reorder" size={0}>
                  <Tooltip title="上移">
                    <Button
                      type="text"
                      size="small"
                      icon={<ArrowUpOutlined />}
                      disabled={index === 0}
                      onClick={() => handleMoveUp(index)}
                    />
                  </Tooltip>
                  <Tooltip title="下移">
                    <Button
                      type="text"
                      size="small"
                      icon={<ArrowDownOutlined />}
                      disabled={index === problems.length - 1}
                      onClick={() => handleMoveDown(index)}
                    />
                  </Tooltip>
                </Space>
              ),
              <Tooltip key="copy-id" title={idContent || '无题号'}>
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
              </Tooltip>,
              <Tooltip key="edit" title="编辑">
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => handleEdit(problem.id)}
                />
              </Tooltip>,
              <Tooltip key="copy" title="复制题目">
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => handleCopy(problem)}
                />
              </Tooltip>,
              <Popconfirm
                key="delete"
                title="确认删除此题？"
                onConfirm={() => handleDelete(problem.id)}
              >
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ].filter(Boolean)}
          >
            <Checkbox
              checked={!!problem.completed}
              onChange={() => handleToggle(problem.id)}
              style={{ textDecoration: problem.completed ? 'line-through' : 'none', color: problem.completed ? token.colorTextTertiary : undefined }}
            >
              {renderMarkdown(problem.name, isDark)}
            </Checkbox>
          </List.Item>
        )
      }}
    />
  )
}
