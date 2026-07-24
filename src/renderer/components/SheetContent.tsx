import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react'
import { getScrollPos, setScrollPos } from './scrollCache'
import { Typography, Button, Space, Modal, Input, message, Empty, Spin } from 'antd'
import { PlusOutlined, ImportOutlined, EditOutlined, CopyOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { submitOnEnter, renderMarkdown } from '../utils'
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
}

export default function SheetContent({ sheetId, activePartId, highlightProblemId, highlightKey }: Props): JSX.Element {
  const [data, setData] = useState<SheetDetail | null>(null)
  const [mdVisible, setMdVisible] = useState(false)
  const [highlightedProblemId, setHighlightedProblemId] = useState<number | null>(null)
  const { refreshTree, selectNode, dataVersion } = useAppContext()
  const partRefs = useRef<Record<number, HTMLDivElement | null>>({})

  const loadData = useCallback(async () => {
    const result = await window.api.sheet.getById({ id: sheetId })
    setData(result)
  }, [sheetId, dataVersion])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (highlightProblemId != null) {
      setHighlightedProblemId(highlightProblemId)
    }
  }, [highlightProblemId, highlightKey])

  useEffect(() => {
    if (data && activePartId && partRefs.current[activePartId]) {
      setTimeout(() => partRefs.current[activePartId]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
      const timer = setTimeout(() => {
        selectNode({ id: sheetId, type: 'sheet', name: data.sheet.name })
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [data, activePartId, sheetId, selectNode])

  const scrollPosRef = useRef(0)
  useLayoutEffect(() => {
    const el = document.getElementById('scroll-container')
    if (!el) return
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
  useEffect(() => { scrollRestored.current = false }, [sheetId])
  useLayoutEffect(() => {
    if (!data || scrollRestored.current) return
    scrollRestored.current = true
    const el = document.getElementById('scroll-container')
    if (!el) return
    const key = `scrollPos_sheet_${sheetId}`
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
  }, [data, sheetId])

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
        <Typography.Text style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{renderMarkdown(data.sheet.description)}</Typography.Text>
        <Space size={2}>
          <Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopyDescription} />
          <Button type="text" size="small" icon={<EditOutlined />} onClick={handleEditDescription} />
        </Space>
      </div>
    )
  }

  return (
    <div>
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
            active={part.id === activePartId}
            domRef={el => { partRefs.current[part.id] = el }}
            highlightedProblemId={highlightedProblemId}
            onHighlightDone={() => setHighlightedProblemId(null)}
            highlightKey={highlightKey}
          />
        ))
      ) : null}

      {!hasParts && data.directProblems.length === 0 ? (
        <Empty description="暂无题目，点击上方按钮添加" style={{ marginTop: 60 }} />
      ) : null}

      {!hasParts && data.directProblems.length > 0 ? (
        <div>
          <Typography.Text strong style={{ fontSize: 15, display: 'block', marginBottom: 8 }}>题目</Typography.Text>
          <ProblemList problems={data.directProblems} onRefresh={loadData} highlightedId={highlightedProblemId} onHighlightDone={() => setHighlightedProblemId(null)} highlightKey={highlightKey} />
        </div>
      ) : null}

      <MarkdownImport
        visible={mdVisible}
        onClose={() => setMdVisible(false)}
        sheetId={sheetId}
        activePartId={activePartId}
        targetFolderId={undefined}
        onImported={() => { loadData(); refreshTree() }}
      />
    </div>
  )
}
