import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react'
import { getScrollPos, setScrollPos } from './scrollCache'
import { Typography, Card, Space, Spin, Empty, Button, Modal, Input, message, Dropdown, Checkbox } from 'antd'
import type { MenuProps } from 'antd'
import { FolderOutlined, OrderedListOutlined, EditOutlined, CopyOutlined, ThunderboltOutlined, SelectOutlined, DeleteOutlined, CheckSquareOutlined } from '@ant-design/icons'
import { renderMarkdown, submitOnEnter, handleLinkPaste } from '../utils'
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
  const [selectMode, setSelectMode] = useState(false)
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<number>>(new Set())
  const [selectedSheetIds, setSelectedSheetIds] = useState<Set<number>>(new Set())
  const { selectNode, refreshTree, isDark, bumpDataVersion, contentReloadSignal } = useAppContext()

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
  }, [folderId])

  useEffect(() => {
    loadData()
  }, [loadData, contentReloadSignal])

  useEffect(() => {
    setSelectMode(false)
    setSelectedFolderIds(new Set())
    setSelectedSheetIds(new Set())
  }, [folderId])

  const scrollPosRef = useRef(0)
  useLayoutEffect(() => {
    const el = document.getElementById('scroll-container')
    if (!el) return
    scrollPosRef.current = el.scrollTop
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
    let cancelled = false
    if (loading || !folderName || scrollRestored.current) return
    scrollRestored.current = true
    const el = document.getElementById('scroll-container')
    if (!el) return
    const key = `scrollPos_folder_${folderId}`
    const cached = getScrollPos(key)
    if (cached !== undefined && cached > 0) {
      el.scrollTop = cached
    } else {
      el.scrollTop = 0
      window.api.ui.get(key).then(saved => {
        if (cancelled) return
        const pos = saved ? parseInt(saved, 10) : 0
        setScrollPos(key, pos)
        if (pos > 0) el.scrollTop = pos
      })
    }
    return () => { cancelled = true }
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
          onPaste={handleLinkPaste}
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
        await loadData()
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
        await loadData()
        message.success('已删除')
      }
    })
  }

  const handleBatchDelete = async () => {
    const total = selectedFolderIds.size + selectedSheetIds.size
    if (total === 0) { message.info('未选择任何内容'); return }
    Modal.confirm({
      title: '确认批量删除',
      content: `将删除 ${selectedFolderIds.size} 个文件夹和 ${selectedSheetIds.size} 个题单，不可恢复。`,
      okText: '删除',
      okType: 'danger',
      onOk: async () => {
        const snapshot: any[] = []
        if (selectedFolderIds.size > 0) {
          for (const fid of selectedFolderIds) {
            const f = subFolders.find(x => x.id === fid)
            if (f) snapshot.push({ table: 'folders', data: { id: f.id, name: f.name, description: f.description, parent_id: f.parent_id, sort_order: 0 } })
          }
          await window.api.folder.batchDelete({ ids: [...selectedFolderIds] })
        }
        if (selectedSheetIds.size > 0) {
          for (const sid of selectedSheetIds) {
            const s = sheets.find(x => x.id === sid)
            if (s) snapshot.push({ table: 'sheets', data: { id: s.id, name: s.name, description: s.description, folder_id: s.folder_id, sort_order: 0 } })
          }
          await window.api.sheet.batchDelete({ ids: [...selectedSheetIds] })
        }
        if (snapshot.length > 0) {
          await window.api.operation.log({ description: `批量删除了 ${snapshot.length} 项内容`, snapshot })
        }
        message.success('已删除')
        setSelectMode(false)
        setSelectedFolderIds(new Set())
        setSelectedSheetIds(new Set())
        bumpDataVersion()
        await refreshTree()
        await loadData()
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
      <div style={{ position: 'sticky', top: 0, zIndex: 20, float: 'right', marginTop: 4 }}>
        <Button size="small" icon={<SelectOutlined />} type={selectMode ? 'primary' : 'default'} onClick={() => { setSelectMode(v => !v); setSelectedFolderIds(new Set()); setSelectedSheetIds(new Set()) }}>选择</Button>
      </div>
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
                  <Card hoverable size="small" style={{ width: selectMode ? 200 : 180 }} onClick={() => { if (!selectMode) selectNode({ id: f.id, type: 'folder', name: f.name }) }}>
                    {selectMode && (
                      <Checkbox
                        checked={selectedFolderIds.has(f.id)}
                        onChange={() => setSelectedFolderIds(prev => { const n = new Set(prev); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n })}
                        style={{ marginRight: 4 }}
                      />
                    )}
                    <span style={{ cursor: selectMode ? 'default' : 'pointer' }}>
                      <FolderOutlined /> {f.name}
                    </span>
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
                  <Card hoverable size="small" style={{ width: selectMode ? 200 : 180 }} onClick={() => { if (!selectMode) selectNode({ id: s.id, type: 'sheet', name: s.name }) }}>
                    {selectMode && (
                      <Checkbox
                        checked={selectedSheetIds.has(s.id)}
                        onChange={() => setSelectedSheetIds(prev => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n })}
                        style={{ marginRight: 4 }}
                      />
                    )}
                    <span style={{ cursor: selectMode ? 'default' : 'pointer' }}>
                      <OrderedListOutlined /> {s.name}
                    </span>
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

      {selectMode && (
        <div style={{ position: 'sticky', bottom: 0, zIndex: 10, background: isDark ? '#1f1f1f' : '#fff', borderTop: `1px solid ${isDark ? '#333' : '#d9d9d9'}`, padding: '8px 16px', marginTop: 16, display: 'flex', justifyContent: 'center' }}>
          <Space>
            <Button size="small" icon={<CheckSquareOutlined />} onClick={() => { subFolders.forEach(f => setSelectedFolderIds(prev => new Set(prev).add(f.id))); sheets.forEach(s => setSelectedSheetIds(prev => new Set(prev).add(s.id))) }}>全选</Button>
            <Button size="small" onClick={() => { setSelectedFolderIds(new Set()); setSelectedSheetIds(new Set()) }}>取消选择</Button>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={handleBatchDelete}>删除</Button>
          </Space>
        </div>
      )}
    </div>
  )
}
