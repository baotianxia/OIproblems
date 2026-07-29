import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react'
import { getScrollPos, setScrollPos } from './scrollCache'
import { Typography, Button, Space, Modal, Input, message, Empty, Spin, Checkbox, Popconfirm } from 'antd'
import { PlusOutlined, ImportOutlined, EditOutlined, CopyOutlined, ThunderboltOutlined, CheckSquareOutlined, DeleteOutlined, SelectOutlined } from '@ant-design/icons'
import { submitOnEnter, renderMarkdown, handleLinkPaste } from '../utils'
import { AutoFocusInput } from './AutoFocusInput'
import ProblemList from './ProblemList'
import PartSection from './PartSection'
import MarkdownImport from './MarkdownImport'
import { useAppContext } from '../context/AppContext'

interface Props {
  sheetId: number
  activePartId?: number
  highlightProblemId?: number | null
  highlightKey?: number
  onSelectPart?: (partId: number, partTitle: string) => void
}

export default function SheetContent({ sheetId, activePartId, highlightProblemId, highlightKey, onSelectPart }: Props): JSX.Element {
  const [data, setData] = useState<SheetDetail | null>(null)
  const [mdVisible, setMdVisible] = useState(false)
  const [highlightedProblemId, setHighlightedProblemId] = useState<number | null>(null)
  const [highlightedPartId, setHighlightedPartId] = useState<number | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedProblemIds, setSelectedProblemIds] = useState<Set<number>>(new Set())
  const [selectedPartIds, setSelectedPartIds] = useState<Set<number>>(new Set())
  const { refreshTree, selectNode, dataVersion, treeVersion, isDark, selectedNode, bumpDataVersion } = useAppContext()
  const partRefs = useRef<Record<number, HTMLDivElement | null>>({})

  const loadData = useCallback(async () => {
    const result = await window.api.sheet.getById({ id: sheetId })
    setData(result)
  }, [sheetId])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (highlightProblemId != null) {
      setHighlightedProblemId(highlightProblemId)
    }
  }, [highlightProblemId, highlightKey])

  useEffect(() => {
    if (!data || activePartId == null) return
    if (!data.parts.some(p => p.id === activePartId)) {
      selectNode({ id: sheetId, type: 'sheet', name: data.sheet.name, folderId: data.sheet.folder_id })
    }
  }, [data])

  const lastScrolledPartRef = useRef<number>()
  useEffect(() => {
    if (!data || !activePartId || !partRefs.current[activePartId]) return
    if (lastScrolledPartRef.current === activePartId) return
    lastScrolledPartRef.current = activePartId
    const block = highlightKey != null ? 'start' : 'nearest'
    setTimeout(() => partRefs.current[activePartId]?.scrollIntoView({ behavior: 'smooth', block }), 100)
  }, [data, activePartId, highlightKey])

  useEffect(() => {
    setHighlightedPartId(null)
    if (activePartId != null && highlightKey != null) {
      setHighlightedPartId(activePartId)
      const timer = setTimeout(() => setHighlightedPartId(null), 1500)
      return () => clearTimeout(timer)
    }
  }, [activePartId, highlightKey])

  useEffect(() => {
    setSelectMode(false)
    setSelectedProblemIds(new Set())
    setSelectedPartIds(new Set())
  }, [sheetId])

  const scrollPosRef = useRef(0)
  useLayoutEffect(() => {
    const el = document.getElementById('scroll-container')
    if (!el) return
    scrollPosRef.current = el.scrollTop
    const onScroll = () => { scrollPosRef.current = el.scrollTop }
    el.addEventListener('scroll', onScroll)
    return () => {
      el.removeEventListener('scroll', onScroll)
      const key = `scrollPos_sheet_${sheetId}`
      const finalPos = scrollPosRef.current
      setScrollPos(key, finalPos)
      window.api.ui.set(key, String(finalPos))
    }
  }, [sheetId])

  const scrollRestored = useRef(false)
  useLayoutEffect(() => { scrollRestored.current = false }, [sheetId])
  useLayoutEffect(() => {
    let cancelled = false
    if (!data || scrollRestored.current) return
    if (data.sheet.id !== sheetId) return
    scrollRestored.current = true
    const el = document.getElementById('scroll-container')
    if (!el) return
    const key = `scrollPos_sheet_${sheetId}`
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
  }, [data, sheetId])

  const handleTogglePart = useCallback((partId: number) => {
    const part = data?.parts.find(p => p.id === partId)
    if (!part) return
    setSelectedPartIds(prev => {
      const next = new Set(prev)
      if (next.has(partId)) {
        next.delete(partId)
        setSelectedProblemIds(prevProblems => {
          const newProbs = new Set(prevProblems)
          for (const p of part.problems) newProbs.delete(p.id)
          return newProbs
        })
      } else {
        next.add(partId)
        setSelectedProblemIds(prevProblems => {
          const newProbs = new Set(prevProblems)
          for (const p of part.problems) newProbs.add(p.id)
          return newProbs
        })
      }
      return next
    })
  }, [data])

  const handleToggleProblem = useCallback((problemId: number) => {
    setSelectedProblemIds(prev => {
      const next = new Set(prev)
      if (next.has(problemId)) next.delete(problemId)
      else next.add(problemId)
      return next
    })
  }, [])

  useLayoutEffect(() => {
    if (!selectMode || !data) return
    setSelectedPartIds(prev => {
      const next = new Set(prev)
      let changed = false
      for (const pid of prev) {
        const part = data.parts.find(p => p.id === pid)
        if (part && !part.problems.every(p => selectedProblemIds.has(p.id))) {
          next.delete(pid)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [selectedProblemIds, selectMode, data])

  const handleSelectAll = useCallback(() => {
    if (!data) return
    const allProblems = new Set<number>()
    const allParts = new Set<number>()
    for (const part of data.parts) {
      allParts.add(part.id)
      for (const p of part.problems) allProblems.add(p.id)
    }
    for (const p of data.directProblems) allProblems.add(p.id)
    setSelectedPartIds(allParts)
    setSelectedProblemIds(allProblems)
  }, [data])

  const handleDeselectAll = useCallback(() => {
    setSelectedPartIds(new Set())
    setSelectedProblemIds(new Set())
  }, [])

  const handleBatchSetCompleted = useCallback(async (completed: boolean) => {
    if (selectedProblemIds.size === 0) {
      message.info('未选择任何题目')
      return
    }
    await window.api.problem.batchSetCompleted({ ids: [...selectedProblemIds], completed })
    setSelectMode(false)
    handleDeselectAll()
    bumpDataVersion()
    message.success(completed ? '已设为完成' : '已设为未完成')
    await loadData()
  }, [selectedProblemIds, bumpDataVersion, loadData, handleDeselectAll])

  const handleBatchDelete = useCallback(async () => {
    const total = selectedPartIds.size + selectedProblemIds.size
    if (total === 0) { message.info('未选择任何内容'); return }
    Modal.confirm({
      title: '确认批量删除',
      content: `将删除 ${selectedPartIds.size} 个 Part 和 ${selectedProblemIds.size} 道题目，不可恢复。`,
      okText: '删除',
      okType: 'danger',
      onOk: async () => {
        const snapshot: any[] = []
        if (selectedPartIds.size > 0) {
          for (const pid of selectedPartIds) {
            const part = data?.parts.find(p => p.id === pid)
            if (part) {
              snapshot.push({ table: 'parts', data: { id: part.id, title: part.title, sheet_id: part.sheet_id, sort_order: 0 } })
              for (const p of part.problems) snapshot.push({ table: 'problems', data: { id: p.id, name: p.name, part_id: p.part_id, sheet_id: p.sheet_id, sort_order: 0, completed: p.completed } })
            }
          }
          await window.api.part.batchDelete({ ids: [...selectedPartIds] })
        }
        const remainingIds = [...selectedProblemIds].filter(id => !data?.parts.some(p => p.problems.some(prob => prob.id === id)))
        if (remainingIds.length > 0) {
          for (const pid of remainingIds) {
            const prob = data?.directProblems.find(p => p.id === pid) || data?.parts.flatMap(p => p.problems).find(p => p.id === pid)
            if (prob) snapshot.push({ table: 'problems', data: { id: prob.id, name: prob.name, part_id: prob.part_id, sheet_id: prob.sheet_id, sort_order: 0, completed: prob.completed } })
          }
          await window.api.problem.batchDelete({ ids: remainingIds })
        }
        if (snapshot.length > 0) {
          await window.api.operation.log({ description: `批量删除了 ${snapshot.length} 项内容`, snapshot })
        }
        message.success('已删除')
        setSelectMode(false)
        handleDeselectAll()
        bumpDataVersion()
        await loadData()
        await refreshTree()
      }
    })
  }, [selectedPartIds, selectedProblemIds, data, bumpDataVersion, loadData, refreshTree, handleDeselectAll])

  const handleAddPart = () => {
    let title = ''
    Modal.confirm({
      title: '新建 Part',
      autoFocusButton: null,
      content: (
        <AutoFocusInput
          placeholder="输入 Part 标题"
          onChange={e => { title = e.target.value }}
          onKeyDown={submitOnEnter}
        />
      ),
      onOk: async () => {
        if (!title.trim()) return
        await window.api.part.create({ title: title.trim(), sheetId })
        await loadData()
        await refreshTree()
        message.success('Part 已创建')
      }
    })
  }

  const handleAddDirectProblem = () => {
    let name = ''
    Modal.confirm({
      title: '新建题目',
      autoFocusButton: null,
      content: (
        <AutoFocusInput
          placeholder="输入题目名称"
          onChange={e => { name = e.target.value }}
          onKeyDown={submitOnEnter}
          onPaste={handleLinkPaste}
        />
      ),
      onOk: async () => {
        if (!name.trim()) return
        await window.api.problem.create({ name: name.trim(), sheetId })
        await loadData()
        message.success('题目已创建')
      }
    })
  }

  const handleAddPartProblem = (partId: number) => {
    let name = ''
    Modal.confirm({
      title: '新建题目',
      autoFocusButton: null,
      content: (
        <AutoFocusInput
          placeholder="输入题目名称"
          onChange={e => { name = e.target.value }}
          onKeyDown={submitOnEnter}
          onPaste={handleLinkPaste}
        />
      ),
      onOk: async () => {
        if (!name.trim()) return
        await window.api.problem.create({ name: name.trim(), partId })
        await loadData()
        message.success('题目已创建')
      }
    })
  }

  const handleEditDescription = () => {
    if (!data) return
    let val = data.sheet.description
    Modal.confirm({
      title: '编辑题单描述',
      autoFocusButton: null,
      content: (
        <Input.TextArea
          defaultValue={data.sheet.description}
          rows={3}
          onChange={e => { val = e.target.value }}
          onPaste={handleLinkPaste}
        />
      ),
      onOk: async () => {
        await window.api.sheet.updateDescription({ id: sheetId, description: val })
        setData(prev => prev ? { ...prev, sheet: { ...prev.sheet, description: val } } : null)
        message.success('描述已更新')
      }
    })
  }

  const handleCopyDescription = async () => {
    if (!data?.sheet.description) return
    await navigator.clipboard.writeText(data.sheet.description)
    message.success('描述已复制到剪贴板')
  }

  const handleRandomProblem = () => {
    if (!data) return
    const allIncomplete: { id: number; partId?: number }[] = []
    for (const p of data.directProblems) {
      if (!p.completed) allIncomplete.push({ id: p.id })
    }
    for (const part of data.parts) {
      for (const p of part.problems) {
        if (!p.completed) allIncomplete.push({ id: p.id, partId: part.id })
      }
    }
    if (allIncomplete.length === 0) {
      message.info('没有未完成的题目')
      return
    }
    setHighlightedProblemId(null)
    const pick = allIncomplete[Math.floor(Math.random() * allIncomplete.length)]
    if (pick.partId && partRefs.current[pick.partId]) {
      partRefs.current[pick.partId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    requestAnimationFrame(() => setHighlightedProblemId(pick.id))
  }

  if (!data) return <Spin style={{ display: 'block', marginTop: 100 }} />

  const hasParts = data.parts.length > 0
  const sheetRate = data.totalProblems > 0
    ? Math.round((data.completedProblems / data.totalProblems) * 100) : 0

  const renderDescription = () => {
    if (!data.sheet.description) return null
    return (
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <Typography.Text style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{renderMarkdown(data.sheet.description, isDark)}</Typography.Text>
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
        <Button icon={<SelectOutlined />} type={selectMode ? 'primary' : 'default'} onClick={() => { setSelectMode(v => !v); handleDeselectAll() }}>选择</Button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Typography.Title level={4} style={{ margin: 0 }}>{data.sheet.name}</Typography.Title>
            <Button type="text" size="small" icon={<EditOutlined />} onClick={handleEditDescription}>编辑描述</Button>
          </div>
          {data.totalProblems > 0 && (
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              已完成 {data.completedProblems}/{data.totalProblems} ({sheetRate}%)
            </Typography.Text>
          )}
        </div>
        <Space>
          <Button icon={<ThunderboltOutlined />} onClick={handleRandomProblem}>随机跳题</Button>
          <Button icon={<ImportOutlined />} onClick={() => setMdVisible(true)}>导入</Button>
          <Button icon={<PlusOutlined />} onClick={handleAddPart}>新建 Part</Button>
          <Button icon={<PlusOutlined />} onClick={handleAddDirectProblem}>新建题目</Button>
        </Space>
      </div>

      {renderDescription()}

      {hasParts ? (
        data.parts.map(part => (
          <PartSection
            key={part.id}
            part={part}
            onRefresh={() => { loadData(); refreshTree() }}
            onAddProblem={() => handleAddPartProblem(part.id)}
            selected={part.id === activePartId}
            highlighted={part.id === highlightedPartId}
            domRef={el => { partRefs.current[part.id] = el }}
            highlightedProblemId={highlightedProblemId}
            onHighlightDone={() => setHighlightedProblemId(null)}
            highlightKey={highlightKey}
            onSelect={(id, title) => onSelectPart?.(id, title)}
            selectMode={selectMode}
            partSelected={selectedPartIds.has(part.id)}
            selectedProblemIds={selectedProblemIds}
            onTogglePart={handleTogglePart}
            onToggleProblem={handleToggleProblem}
          />
        ))
      ) : null}

      {data.directProblems.length > 0 ? (
        <div style={hasParts ? { marginTop: 24 } : undefined}>
          {hasParts && <Typography.Text strong style={{ fontSize: 15, display: 'block', marginBottom: 8 }}>未分区的题目</Typography.Text>}
          {!hasParts && <Typography.Text strong style={{ fontSize: 15, display: 'block', marginBottom: 8 }}>题目</Typography.Text>}
          <ProblemList problems={data.directProblems} onRefresh={loadData} highlightedId={highlightedProblemId} onHighlightDone={() => setHighlightedProblemId(null)} highlightKey={highlightKey} selectMode={selectMode} selectedIds={selectedProblemIds} onToggleSelect={handleToggleProblem} />
        </div>
      ) : null}

      {!hasParts && data.directProblems.length === 0 ? (
        <Empty description="暂无题目，点击上方按钮添加" style={{ marginTop: 60 }} />
      ) : null}

      {selectMode && (
        <div style={{ position: 'sticky', bottom: 0, zIndex: 10, background: isDark ? '#1f1f1f' : '#fff', borderTop: `1px solid ${isDark ? '#333' : '#d9d9d9'}`, padding: '8px 16px', marginTop: 16, display: 'flex', justifyContent: 'center' }}>
          <Space>
            <Button size="small" icon={<CheckSquareOutlined />} onClick={handleSelectAll}>全选</Button>
            <Button size="small" onClick={handleDeselectAll}>取消选择</Button>
            <Popconfirm title={`删除 ${selectedPartIds.size} 个 Part 和 ${selectedProblemIds.size} 道题目？`} onConfirm={handleBatchDelete} okText="删除" okType="danger">
              <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
            <Button size="small" onClick={() => handleBatchSetCompleted(true)}>设为已做</Button>
            <Button size="small" onClick={() => handleBatchSetCompleted(false)}>设为未做</Button>
          </Space>
        </div>
      )}

      <MarkdownImport
        visible={mdVisible}
        onClose={() => setMdVisible(false)}
        selectedNode={selectedNode}
        onImported={() => { loadData(); refreshTree() }}
      />
    </div>
  )
}
