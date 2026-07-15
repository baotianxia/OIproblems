import { useState } from 'react'
import { Modal, Input, message, Typography, Button, Space } from 'antd'
import { FileAddOutlined } from '@ant-design/icons'
import { AutoFocusTextArea } from './AutoFocusInput'

interface Props {
  visible: boolean
  onClose: () => void
  targetFolderId?: number
  sheetId?: number
  activePartId?: number
  onImported: () => void
}

export default function MarkdownImport({ visible, onClose, targetFolderId, sheetId, activePartId, onImported }: Props): JSX.Element {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')

  const handleSelectFile = async () => {
    const result = await window.api.file.openMarkdown()
    if (result.content) {
      setText(result.content)
      setFileName(result.fileName ?? '')
    }
  }

  const handleOk = async () => {
    if (!text.trim()) {
      message.warning('请输入内容或选择文件')
      return
    }

    const lines = text.split('\n')
    const hasH2 = lines.some(l => /^##[^#]/.test(l.trim()))
    if (!hasH2 && !sheetId && !activePartId) {
      message.warning('当前没有题单上下文，请在内容中使用 ## 创建题单，或先在左侧选择一个题单')
      return
    }

    await window.api.markdown.import({ content: text, targetFolderId, sheetId, activePartId })
    message.success('导入成功')
    setText('')
    setFileName('')
    onClose()
    onImported()
  }

  const handleCancel = () => {
    setText('')
    setFileName('')
    onClose()
  }

  return (
    <Modal
      title="导入"
      open={visible}
      autoFocus={false}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="导入"
      cancelText="取消"
      width={600}
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        支持两种格式：
      </Typography.Paragraph>
      <Space style={{ marginBottom: 8 }}>
        <Button icon={<FileAddOutlined />} onClick={handleSelectFile}>选择文件</Button>
        {fileName && <Typography.Text type="secondary" ellipsis style={{ maxWidth: 400 }}>{fileName}</Typography.Text>}
      </Space>
      <AutoFocusTextArea
        rows={15}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={
          '支持 Markdown 层级和纯文本列表两种格式：\n\n' +
          '# 文件夹\n' +
          '## 题单\n' +
          '### Part\n' +
          '- [ ] 题目（待完成）\n' +
          '- [x] 题目（已完成）\n\n' +
          '或每行一条纯文本题目：\n' +
          'P1000 A+B Problem\n' +
          'P1001 Hello World'
        }
      />
    </Modal>
  )
}
