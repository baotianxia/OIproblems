import { useState, useMemo } from 'react'
import { Modal, Input, message, Typography, Button, Space, Tree, Empty } from 'antd'
import { FileAddOutlined, FolderOutlined, OrderedListOutlined, FileOutlined, QuestionOutlined, WarningOutlined } from '@ant-design/icons'
import type { DataNode } from 'antd/es/tree'
import { AutoFocusTextArea } from './AutoFocusInput'
import { parseMarkdownToTree, computeImportParams } from '../importPreview'
import type { PreviewItem } from '../importPreview'
import type { SelectedNode } from '../types'

interface Props {
  visible: boolean
  onClose: () => void
  selectedNode?: SelectedNode | null
  onImported: () => void
}

const PROBLEM_LIMIT = 3

function convertToDataNode(
  item: PreviewItem,
  depth: number
): DataNode {
  if (item.type === 'problem') {
    return { key: item.id, title: item.title, icon: <QuestionOutlined style={{ fontSize: 13 }} />, isLeaf: true, style: { fontSize: 13 } }
  }

  let icon = <FolderOutlined />
  if (item.type === 'sheet') icon = <OrderedListOutlined />
  else if (item.type === 'part') icon = <FileOutlined />

  const children: DataNode[] = []
  const problems = item.children?.filter(c => c.type === 'problem') ?? []
  const subItems = item.children?.filter(c => c.type !== 'problem') ?? []

  for (const sub of subItems) {
    children.push(convertToDataNode(sub, depth + 1))
  }

  if (problems.length > 0) {
    const shown = problems.slice(0, PROBLEM_LIMIT)
    for (const p of shown) {
      children.push({ key: p.id, title: p.title, icon: <QuestionOutlined style={{ fontSize: 13 }} />, isLeaf: true, style: { fontSize: 13 } })
    }
    if (problems.length > PROBLEM_LIMIT) {
      children.push({
        key: `${item.id}-more`,
        title: `...还有${problems.length - PROBLEM_LIMIT}道`,
        isLeaf: true,
        style: { color: '#999', fontSize: 12, fontStyle: 'italic' }
      })
    }
  }

  return {
    key: item.id,
    title: item.title,
    icon,
    children: children.length > 0 ? children : undefined
  }
}

export default function MarkdownImport({ visible, onClose, selectedNode, onImported }: Props): JSX.Element {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')

  const context = useMemo(() => {
    if (!selectedNode) return undefined
    if (selectedNode.type === 'sheet') {
      return { sheetId: selectedNode.id, partId: selectedNode.partId }
    }
    return undefined
  }, [selectedNode])

  const preview = useMemo(() => {
    if (!text.trim()) return null
    return parseMarkdownToTree(text, context)
  }, [text, context])

  const { params, placementText, error: previewError } = useMemo(() => {
    if (!preview) return { params: undefined, placementText: undefined, error: undefined }
    return computeImportParams(preview, selectedNode ?? null)
  }, [preview, selectedNode])

  const treeData = useMemo(() => {
    if (!preview) return []
    const children = preview.tree.map(n => convertToDataNode(n, 0))
    if (!placementText) return children
    return [{
      key: 'placement-root',
      title: placementText,
      icon: <FolderOutlined />,
      children
    }] as DataNode[]
  }, [preview, placementText])

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

    if (!preview || !params) {
      message.warning(previewError || '无法解析内容')
      return
    }

    if (preview.warnings.length > 0) {
      message.warning(`存在 ${preview.warnings.length} 个问题，请修正后再导入`)
      return
    }

    const result = await window.api.markdown.import({
      content: text,
      targetFolderId: params.targetFolderId,
      sheetId: params.sheetId,
      activePartId: params.activePartId
    })
    if (!result.success) {
      message.error(result.error || '导入失败')
      return
    }
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

  const hasWarnings = (preview?.warnings?.length ?? 0) > 0
  const canImport = !!preview && !previewError && !!params && !hasWarnings

  const defaultExpandedKeys = useMemo(() => {
    if (!treeData.length) return []
    const keys: React.Key[] = []
    const collect = (nodes: DataNode[]) => {
      for (const n of nodes) {
        if (n.children) {
          keys.push(n.key)
          collect(n.children)
        }
      }
    }
    collect(treeData)
    return keys
  }, [treeData])

  return (
    <Modal
      title="导入"
      open={visible}
      maskClosable={false}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="导入"
      cancelText="取消"
      okButtonProps={{ disabled: !canImport }}
      width={680}
    >
      <Space style={{ marginBottom: 8 }}>
        <Button icon={<FileAddOutlined />} onClick={handleSelectFile}>选择文件</Button>
        {fileName && <Typography.Text type="secondary" ellipsis style={{ maxWidth: 400 }}>{fileName}</Typography.Text>}
      </Space>
      <AutoFocusTextArea
        rows={10}
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
      {preview && (
        <div style={{ marginTop: 12, border: '1px solid #d9d9d9', borderRadius: 6, padding: '8px 12px', maxHeight: 320, overflow: 'auto' }}>
          <Typography.Text strong style={{ fontSize: 13 }}>
            预览：{preview.folderCount > 0 ? `${preview.folderCount} 个文件夹 │ ` : ''}{preview.sheetCount > 0 ? `${preview.sheetCount} 个题单 │ ` : ''}{preview.partCount > 0 ? `${preview.partCount} 个 Part │ ` : ''}{preview.problemCount} 道题目
          </Typography.Text>
          {hasWarnings && (
            <div style={{ marginTop: 6, padding: '6px 8px', background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 4 }}>
              <Typography.Text type="danger" style={{ fontSize: 13, fontWeight: 500 }}>
                <WarningOutlined /> {preview.warnings.length} 个问题需要修复：
              </Typography.Text>
              {preview.warnings.map((w, idx) => (
                <div key={idx} style={{ fontSize: 12, color: '#ff4d4f', marginTop: 2 }}>
                  第{w.line}行：{w.message} — <Typography.Text code style={{ fontSize: 12, color: '#ff4d4f', background: 'transparent' }}>{w.text}</Typography.Text>
                </div>
              ))}
            </div>
          )}
          {previewError && (
            <Typography.Text type="danger" style={{ display: 'block', fontSize: 13, marginTop: 4 }}>{previewError}</Typography.Text>
          )}
          <Tree
            treeData={treeData}
            defaultExpandedKeys={defaultExpandedKeys}
            showIcon
            style={{ marginTop: 8, fontSize: 13 }}
            selectable={false}
          />
        </div>
      )}
      {!preview && text.trim() && (
        <Empty description="无法解析内容，请检查格式" style={{ marginTop: 12 }} />
      )}
    </Modal>
  )
}
