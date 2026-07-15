import { useState } from 'react'
import { Typography, Button, Input, Modal, message, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { submitOnEnter } from '../utils'
import { AutoFocusInput } from './AutoFocusInput'
import ProblemList from './ProblemList'

interface Props {
  part: PartItem & { problems: ProblemItem[]; totalProblems: number; completedProblems: number }
  onRefresh: () => void
  onAddProblem: () => void
  active?: boolean
  domRef?: (el: HTMLDivElement | null) => void
}

export default function PartSection({ part, onRefresh, onAddProblem, active, domRef }: Props): JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const rate = part.totalProblems > 0
    ? Math.round((part.completedProblems / part.totalProblems) * 100) : 0

  const handleRename = () => {
    let newTitle = ''
    Modal.confirm({
      title: '重命名 Part',
      autoFocusButton: null,
      content: (
        <AutoFocusInput
          defaultValue={part.title}
          onChange={e => { newTitle = e.target.value }}
          onKeyDown={submitOnEnter}
        />
      ),
      onOk: async () => {
        if (!newTitle.trim()) return
        await window.api.part.rename({ id: part.id, title: newTitle.trim() })
        message.success('Part 已重命名')
        onRefresh()
      }
    })
  }

  const handleDelete = async () => {
    await window.api.part.delete({ id: part.id })
    message.success('Part 已删除')
    onRefresh()
  }

  return (
    <div
      ref={domRef}
      id={`part-${part.id}`}
      style={{
        marginBottom: 16,
        border: `1px solid ${active ? '#1890ff' : '#f0f0f0'}`,
        borderRadius: 8,
        padding: 12,
        background: active ? '#e6f7ff' : undefined,
        transition: 'border-color 0.3s, background 0.3s'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div
          style={{ cursor: 'pointer', userSelect: 'none', flex: 1 }}
          onClick={() => setCollapsed(!collapsed)}
        >
          <Typography.Title level={5} style={{ margin: 0 }}>
            {collapsed ? '▶' : '▼'} {part.title}
          </Typography.Title>
          {part.totalProblems > 0 && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              已完成 {part.completedProblems}/{part.totalProblems} ({rate}%)
            </Typography.Text>
          )}
        </div>
        <div>
          <Button type="text" size="small" icon={<PlusOutlined />} onClick={onAddProblem}>添加题目</Button>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={handleRename} />
          <Popconfirm title="确认删除此 Part？内部的题目也将被删除" onConfirm={handleDelete}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      </div>
      {!collapsed && (
        <ProblemList problems={part.problems} onRefresh={onRefresh} />
      )}
    </div>
  )
}
