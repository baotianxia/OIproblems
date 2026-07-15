import { useState } from 'react'
import { List, Checkbox, Button, Popconfirm, Input, Modal, message, Space, theme } from 'antd'
import { DeleteOutlined, EditOutlined, ArrowUpOutlined, ArrowDownOutlined, CopyOutlined } from '@ant-design/icons'
import { submitOnEnter } from '../utils'
import { AutoFocusInput } from './AutoFocusInput'


interface Props {
  problems: ProblemItem[]
  onRefresh: () => void
  showReorder?: boolean
}

export default function ProblemList({ problems, onRefresh, showReorder = true }: Props): JSX.Element {
  const [editingId, setEditingId] = useState<number | null>(null)
  const { token } = theme.useToken()

  const handleToggle = async (id: number) => {
    await window.api.problem.toggle({ id })
    onRefresh()
  }

  const handleDelete = async (id: number) => {
    await window.api.problem.delete({ id })
    message.success('已删除')
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
    onRefresh()
  }

  const handleMoveDown = async (index: number) => {
    if (index === problems.length - 1) return
    const items = problems.map((p, i) => ({
      id: p.id,
      sortOrder: i === index ? index + 1 : i === index + 1 ? index : i
    }))
    await window.api.problem.reorder({ items })
    onRefresh()
  }

  const handleCopy = async (problem: ProblemItem) => {
    await navigator.clipboard.writeText(problem.name)
    message.success('已复制到剪贴板')
  }

  return (
    <List
      dataSource={problems}
      renderItem={(problem, index) => (
        <List.Item
          style={{ padding: '8px 16px', background: problem.completed ? token.colorSuccessBg : undefined }}
          actions={[
            showReorder && (
              <Space key="reorder" size={0}>
                <Button
                  type="text"
                  size="small"
                  icon={<ArrowUpOutlined />}
                  disabled={index === 0}
                  onClick={() => handleMoveUp(index)}
                />
                <Button
                  type="text"
                  size="small"
                  icon={<ArrowDownOutlined />}
                  disabled={index === problems.length - 1}
                  onClick={() => handleMoveDown(index)}
                />
              </Space>
            ),
            <Button
              key="edit"
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(problem.id)}
            />,
            <Button
              key="copy"
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => handleCopy(problem)}
            />,
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
            {problem.name}
          </Checkbox>
        </List.Item>
      )}
    />
  )
}
