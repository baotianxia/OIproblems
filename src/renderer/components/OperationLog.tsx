import { useEffect, useState } from 'react'
import { Modal, List, Button, message, Typography, Space, InputNumber, Popconfirm } from 'antd'
import { RollbackOutlined, DeleteOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { useAppContext } from '../context/AppContext'

interface Props {
  visible: boolean
  onClose: () => void
}

export default function OperationLog({ visible, onClose }: Props): JSX.Element {
  const [logs, setLogs] = useState<{ id: number; description: string; created_at: string }[]>([])
  const [maxCount, setMaxCount] = useState(100)

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
      <List
        dataSource={logs}
        renderItem={item => (
          <List.Item
            actions={[
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
    </Modal>
  )
}