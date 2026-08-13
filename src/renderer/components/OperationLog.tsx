import { useEffect, useState } from 'react'
import { Modal, List, Button, message, Typography, Space, InputNumber, Popconfirm, Tree, Empty } from 'antd'
import { RollbackOutlined, DeleteOutlined, ClockCircleOutlined, EyeOutlined, FolderOutlined, OrderedListOutlined, FileOutlined, QuestionOutlined } from '@ant-design/icons'
import type { DataNode } from 'antd/es/tree'
import { useAppContext } from '../context/AppContext'

interface Props {
  visible: boolean
  onClose: () => void
}

interface LogEntry {
  id: number
  description: string
  created_at: string
  snapshot: { table: string; data: any }[]
}

function buildSnapshotTreeData(snapshot: { table: string; data: any }[]): DataNode[] {
  const folders = snapshot.filter(e => e.table === 'folders').map(e => e.data)
  const sheets = snapshot.filter(e => e.table === 'sheets').map(e => e.data)
  const parts = snapshot.filter(e => e.table === 'parts').map(e => e.data)
  const problems = snapshot.filter(e => e.table === 'problems').map(e => e.data)

  const folderChildren = new Map<number, any[]>()
  for (const f of folders) {
    const pk = f.parent_id ?? 0
    if (!folderChildren.has(pk)) folderChildren.set(pk, [])
    folderChildren.get(pk)!.push(f)
  }
  const sheetChildren = new Map<number, any[]>()
  for (const s of sheets) {
    const fk = s.folder_id ?? 0
    if (!sheetChildren.has(fk)) sheetChildren.set(fk, [])
    sheetChildren.get(fk)!.push(s)
  }
  const partChildren = new Map<number, any[]>()
  for (const p of parts) {
    if (!partChildren.has(p.sheet_id)) partChildren.set(p.sheet_id, [])
    partChildren.get(p.sheet_id)!.push(p)
  }
  const partProblems = new Map<number, any[]>()
  const sheetProblems = new Map<number, any[]>()
  for (const pr of problems) {
    if (pr.part_id != null) {
      if (!partProblems.has(pr.part_id)) partProblems.set(pr.part_id, [])
      partProblems.get(pr.part_id)!.push(pr)
    } else if (pr.sheet_id != null) {
      if (!sheetProblems.has(pr.sheet_id)) sheetProblems.set(pr.sheet_id, [])
      sheetProblems.get(pr.sheet_id)!.push(pr)
    }
  }

  const problemNode = (pr: any): DataNode => ({
    key: `p-${pr.id}`,
    title: pr.name,
    icon: <QuestionOutlined style={{ fontSize: 13 }} />,
    isLeaf: true
  })

  const buildSheet = (s: any): DataNode => {
    const children: DataNode[] = []
    for (const p of partChildren.get(s.id) ?? []) {
      children.push({
        key: `part-${p.id}`,
        title: p.title,
        icon: <FileOutlined />,
        children: (partProblems.get(p.id) ?? []).map(problemNode)
      })
    }
    for (const pr of sheetProblems.get(s.id) ?? []) children.push(problemNode(pr))
    return {
      key: `sheet-${s.id}`,
      title: s.name,
      icon: <OrderedListOutlined />,
      children: children.length > 0 ? children : undefined
    }
  }

  const buildFolder = (f: any): DataNode => {
    const children: DataNode[] = []
    for (const s of sheetChildren.get(f.id) ?? []) children.push(buildSheet(s))
    for (const cf of folderChildren.get(f.id) ?? []) children.push(buildFolder(cf))
    return {
      key: `folder-${f.id}`,
      title: f.name,
      icon: <FolderOutlined />,
      children: children.length > 0 ? children : undefined
    }
  }

  const roots: DataNode[] = []
  for (const f of folderChildren.get(0) ?? []) roots.push(buildFolder(f))
  for (const s of sheetChildren.get(0) ?? []) roots.push(buildSheet(s))
  for (const pr of problems) {
    const orphan = pr.part_id != null
      ? !parts.some(p => p.id === pr.part_id)
      : pr.sheet_id != null
        ? !sheets.some(s => s.id === pr.sheet_id)
        : true
    if (orphan) roots.push(problemNode(pr))
  }
  return roots
}

export default function OperationLog({ visible, onClose }: Props): JSX.Element {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [maxCount, setMaxCount] = useState(100)
  const [viewItem, setViewItem] = useState<LogEntry | null>(null)

  useEffect(() => {
    if (!visible) return
    loadLogs()
  }, [visible])

  const loadLogs = async () => {
    const data = await window.api.operation.getLogs({ limit: maxCount })
    setLogs(data)
  }

  const handleRollback = async (id: number) => {
    const result = await window.api.operation.rollback({ id })
    if (!result.success) {
      message.error(result.error || '回滚失败')
      return
    }
    message.success('回滚成功，页面即将刷新')
    onClose()
    window.location.reload()
  }

  const handleCleanup = async () => {
    await window.api.operation.cleanup({ maxCount })
    message.success(`已清理，最多保留 ${maxCount} 条`)
    await loadLogs()
  }

  return (
    <Modal
      title={<><ClockCircleOutlined /> 操作日志</>}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={640}
    >
      <Space style={{ marginBottom: 12 }}>
        <span>最多保留：</span>
        <InputNumber min={10} max={1000} step={10} value={maxCount} onChange={v => v != null && setMaxCount(v)} size="small" />
        <Button size="small" onClick={handleCleanup}>应用</Button>
      </Space>
      <div style={{ maxHeight: 420, overflow: 'auto' }}>
        <List
          dataSource={logs}
          renderItem={item => (
            <List.Item
              actions={[
                <Button key="view" size="small" icon={<EyeOutlined />} onClick={() => setViewItem(item)}>查看</Button>,
                <Popconfirm key="rollback" title="回滚到此操作前？此操作之后的内容将丢失。" onConfirm={() => handleRollback(item.id)}>
                  <Button size="small" icon={<RollbackOutlined />}>回滚</Button>
                </Popconfirm>
              ]}
            >
              <List.Item.Meta
                title={item.description}
                description={<Typography.Text type="secondary" style={{ fontSize: 12 }}>{item.created_at}</Typography.Text>}
              />
            </List.Item>
          )}
          locale={{ emptyText: '暂无操作记录' }}
        />
      </div>
      <Modal
        title={`删除内容：${viewItem?.description ?? ''}`}
        open={viewItem != null}
        onCancel={() => setViewItem(null)}
        footer={null}
        width={560}
      >
        {viewItem && viewItem.snapshot.length > 0 ? (
          <Tree
            treeData={buildSnapshotTreeData(viewItem.snapshot)}
            defaultExpandAll
            showIcon
            style={{ fontSize: 13 }}
            selectable={false}
          />
        ) : (
          <Empty description="无内容" />
        )}
      </Modal>
    </Modal>
  )
}