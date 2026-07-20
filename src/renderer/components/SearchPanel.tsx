import { useState, useCallback, useRef, Fragment } from 'react'
import { Input, List, Typography, Tag, Space, Empty, theme } from 'antd'
import { FolderOutlined, OrderedListOutlined, FileOutlined, QuestionOutlined } from '@ant-design/icons'
import { useAppContext } from '../context/AppContext'

function HighlightText({ text, query }: { text: string; query: string }): JSX.Element {
  const { isDark } = useAppContext()
  if (!query.trim()) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <span style={{
        background: isDark ? '#efdb50' : '#fadb14',
        borderRadius: 2,
        padding: '0 2px',
        color: '#000'
      }}>
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function SearchPanel(): JSX.Element {
  const { token } = theme.useToken()
  const [results, setResults] = useState<SearchResults | null>(null)
  const [visible, setVisible] = useState(false)
  const [query, setQuery] = useState('')
  const { selectNode } = useAppContext()
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const handleSearch = useCallback((value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setQuery(value)
    if (!value.trim()) {
      setResults(null)
      setVisible(false)
      return
    }
    timerRef.current = setTimeout(async () => {
      const res = await window.api.search.global({ query: value.trim() })
      setResults(res)
      setVisible(true)
    }, 300)
  }, [])

  const handleSelect = (item: { type: string; id: number; name?: string; folder_id?: number; sheet_id?: number }) => {
    if (item.type === 'folder') {
      selectNode(null)
      requestAnimationFrame(() => selectNode({ id: item.id, type: 'folder', name: item.name }))
    } else if (item.type === 'sheet') {
      selectNode(null)
      requestAnimationFrame(() => selectNode({ id: item.id, type: 'sheet', name: item.name }))
    } else if (item.type === 'part') {
      selectNode(null)
      requestAnimationFrame(() => selectNode({ id: item.sheet_id!, type: 'sheet', name: item.name, partId: item.id }))
    } else if (item.type === 'problem') {
      selectNode(null)
      requestAnimationFrame(() => selectNode({ id: item.sheet_id!, type: 'sheet', name: item.name, highlightProblemId: item.id }))
    }
    setVisible(false)
  }

  const allItems = [
    ...(results?.folders.map(f => ({ ...f, label: '文件夹', icon: <FolderOutlined /> })) ?? []),
    ...(results?.sheets.map(s => ({ ...s, label: '题单', icon: <OrderedListOutlined /> })) ?? []),
    ...(results?.parts.map(p => ({ ...p, label: 'Part', icon: <FileOutlined /> })) ?? []),
    ...(results?.problems.map(p => ({ ...p, label: '题目', icon: <QuestionOutlined /> })) ?? [])
  ]

  return (
    <div style={{ padding: '8px 16px', position: 'relative' }}>
      <Input.Search
        placeholder="全局搜索..."
        onChange={e => handleSearch(e.target.value)}
        allowClear
        onFocus={() => { if (results) setVisible(true) }}
        onBlur={() => setTimeout(() => setVisible(false), 200)}
      />
      {visible && allItems.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 16,
            right: 16,
            zIndex: 100,
            background: token.colorBgElevated,
            boxShadow: token.boxShadowSecondary,
            borderRadius: token.borderRadiusLG,
            maxHeight: 300,
            overflow: 'auto'
          }}
        >
          <List
            size="small"
            dataSource={allItems}
            renderItem={item => (
              <List.Item
                style={{ cursor: 'pointer', padding: '6px 12px' }}
                onMouseDown={() => handleSelect(item)}
              >
                <Space>
                  {item.icon}
                  <Typography.Text ellipsis style={{ maxWidth: 180 }}>
                    <HighlightText text={item.name ?? ''} query={query} />
                  </Typography.Text>
                  <Tag color="blue" style={{ fontSize: 11, lineHeight: '18px' }}>{item.label}</Tag>
                </Space>
              </List.Item>
            )}
          />
        </div>
      )}
      {visible && allItems.length === 0 && results && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 16,
            right: 16,
            zIndex: 100,
            background: token.colorBgElevated,
            boxShadow: token.boxShadowSecondary,
            borderRadius: token.borderRadiusLG
          }}
        >
          <Empty description="未找到结果" style={{ margin: '16px 0' }} />
        </div>
      )}
    </div>
  )
}
