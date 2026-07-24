import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react'
import { getScrollPos, setScrollPos } from './scrollCache'
import { Typography, Card, Space, Spin, Empty, Button, Modal, Input, message, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import { FolderOutlined, OrderedListOutlined, EditOutlined, CopyOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { renderMarkdown, submitOnEnter } from '../utils'
import { AutoFocusInput } from './AutoFocusInput'
import { useAppContext } from '../context/AppContext'

interface Props {
  folderId: number
}

export default function FolderContent({ folderId }: Props): JSX.Element {
  const [subFolders, setSubFolders] = useState<FolderItem[]>([])
  const [sheets, setSheets] = useState<SheetItem[]>([])
  const [folderName, setFolderName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<GlobalStats | null>(null)
  const { selectNode, refreshTree, treeVersion, dataVersion, isDark } = useAppContext()

  const handleRandomProblem = async () => {
    const result = await window.api.problem.randomFromContext({ folderId })
    if (!result) {
      message.info('没有未完成的题目')
      return
    }
    selectNode({ id: result.sheet_id, type: 'sheet', name: result.name, highlightProblemId: result.id })
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await window.api.tree.get()
      const folder = data.folders.find(f => f.id === folderId)
      if (folder) {
        setFolderName(folder.name)
        setDescription(folder.description || '')
      }

      const children = data.folders.filter(f => f.parent_id === folderId)
      setSubFolders(children)

      const sheetList = data.sheets.filter(s => s.folder_id === folderId)
      setSheets(sheetList)

      const s = await window.api.stats.folder({ id: folderId })
      setStats(s)
    } finally {
      setLoading(false)
    }
  }, [folderId, treeVersion, dataVersion])

  useEffect(() => {
    loadData()
  }, [loadData])

  const scrollPosRef = useRef(0)
  useLayoutEffect(() => {
    const el = document.getElementById('scroll-container')
    if (!el) return
    const onScroll = () => { scrollPosRef.current = el.scrollTop }
    el.addEventListener('scroll', onScroll)
    return () => {
      el.removeEventListener('scroll', onScroll)
      const key = `scrollPos_folder_${folderId}`
      const finalPos = scrollPosRef.current
      setScrollPos(key, finalPos)
      window.api.ui.set(key, String(finalPos))
    }
  }, [folderId])

  const scrollRestored = useRef(false)
  useEffect(() => { scrollRestored.current = false }, [folderId])
  useLayoutEffect(() => {
    if (loading || !folderName || scrollRestored.current) return
    scrollRestored.current = true
    const el = document.getElementById('scroll-container')
    if (!el) return
    const key = `scrollPos_folder_${folderId}`
    const cached = getScrollPos(key)
    if (cached !== undefined && cached > 0) {
      el.scrollTop = cached
    } else {
      window.api.ui.get(key).then(saved => {
        const pos = saved ? parseInt(saved, 10) : 0
        setScrollPos(key, pos)
        if (pos > 0) el.scrollTop = pos
      })
    }
  }, [loading, folderName, folderId])

  const handleEditDescription = () => {
    let val = description
    Modal.confirm({
      title: '编辑目录描述',
      autoFocusButton: null,
      content: (
        <Input.TextArea
          defaultValue={description}
          rows={3}
          onChange={e => { val = e.target.value }}
        />
      ),
      onOk: async () => {
        await window.api.folder.updateDescription({ id: folderId, description: val })
        setDescription(val)
        message.success('描述已更新')
      }
    })
  }

  const handleCopyDescription = async () => {
    if (!description) return
    await navigator.clipboard.writeText(description)
    message.success('描述已复制到剪贴板')
  }

  const renameFolder = (id: number, currentName: string) => {
    let newName = ''
    Modal.confirm({
      title: '重命名文件夹',
      autoFocusButton: null,
      content: (
        <AutoFocusInput defaultValue={currentName} placeholder="输入新名称" onChange={e => { newName = e.target.value }} onKeyDown={submitOnEnter} />
      ),
      onOk: async () => {
        if (!newName.trim()) return
        await window.api.folder.rename({ id, name: newName.trim() })
        loadData()
        refreshTree()
        message.success('已重命名')
      }
    })
  }

  const deleteFolder = (id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除后无法恢复，确认继续？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        await window.api.folder.delete({ id })
        await refreshTree()
        message.success('已删除')
      }
    })
  }

  const renameSheet = (id: number, currentName: string) => {
    let newName = ''
    Modal.confirm({
      title: '重命题单',
      autoFocusButton: null,
      content: (
        <AutoFocusInput defaultValue={currentName} placeholder="输入新名称" onChange={e => { newName = e.target.value }} onKeyDown={submitOnEnter} />
      ),
      onOk: async () => {
        if (!newName.trim()) return
        await window.api.sheet.rename({ id, name: newName.trim() })
        loadData()
        refreshTree()
        message.success('已重命名')
      }
    })
  }

  const deleteSheet = (id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除后无法恢复，确认继续？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        await window.api.sheet.delete({ id })
        await refreshTree()
        message.success('已删除')
      }
    })
  }

  if (loading) return <Spin style={{ display: 'block', marginTop: 100 }} />

  const renderStats = () => {
    if (!stats) return null
    const rate = stats.totalProblems > 0
      ? Math.round((stats.completedProblems / stats.totalProblems) * 100) : 0
    return (
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        全部 {stats.completedProblems}/{stats.totalProblems} ({rate}%)
      </Typography.Text>
    )
  }

  const renderDescription = () => {
    if (!description) return null
    return (
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <Typography.Text style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{renderMarkdown(description, isDark)}</Typography.Text>
        <Space size={2}>
          <Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopyDescription} />
          <Button type="text" size="small" icon={<EditOutlined />} onClick={handleEditDescription} />
        </Space>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          <FolderOutlined /> {folderName}
        </Typography.Title>
        <Space>
          <Button size="small" icon={<ThunderboltOutlined />} onClick={handleRandomProblem}>随机跳题</Button>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={handleEditDescription}>编辑描述</Button>
        </Space>
      </div>
      {renderDescription()}
      {renderStats()}

      {subFolders.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>子文件夹</Typography.Text>
          <Space wrap>
            {subFolders.map(f => {
              const folderMenuItems: MenuProps['items'] = [
                { key: 'rename', label: '重命名', onClick: () => renameFolder(f.id, f.name) },
                { key: 'delete', label: '删除', danger: true, onClick: () => deleteFolder(f.id) },
              ]
              return (
                <Dropdown key={f.id} menu={{ items: folderMenuItems }} trigger={['contextMenu']}>
                  <Card
                    hoverable
                    size="small"
                    style={{ width: 180 }}
                    onClick={() => selectNode({ id: f.id, type: 'folder', name: f.name })}
                  >
                    <FolderOutlined /> {f.name}
                  </Card>
                </Dropdown>
              )
            })}
          </Space>
        </div>
      )}

      {sheets.length > 0 && (
        <div>
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>题单</Typography.Text>
          <Space wrap>
            {sheets.map(s => {
              const sheetMenuItems: MenuProps['items'] = [
                { key: 'rename', label: '重命名', onClick: () => renameSheet(s.id, s.name) },
                { key: 'delete', label: '删除', danger: true, onClick: () => deleteSheet(s.id) },
              ]
              return (
                <Dropdown key={s.id} menu={{ items: sheetMenuItems }} trigger={['contextMenu']}>
                  <Card
                    hoverable
                    size="small"
                    style={{ width: 180 }}
                    onClick={() => selectNode({ id: s.id, type: 'sheet', name: s.name })}
                  >
                    <OrderedListOutlined /> {s.name}
                  </Card>
                </Dropdown>
              )
            })}
          </Space>
        </div>
      )}

      {subFolders.length === 0 && sheets.length === 0 && (
        <Empty description="空文件夹" style={{ marginTop: 60 }} />
      )}
    </div>
  )
}
