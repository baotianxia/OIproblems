import { useState, useEffect, useCallback } from 'react'
import { ConfigProvider, theme, Layout, Typography, Spin, Button, message, Modal, Space, Switch } from 'antd'
import { FolderAddOutlined, OrderedListOutlined, ImportOutlined, ExportOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons'
import { submitOnEnter } from './utils'
import { AutoFocusInput } from './components/AutoFocusInput'
import { AppProvider, useAppContext } from './context/AppContext'
import DirectoryTree from './components/DirectoryTree'
import SheetContent from './components/SheetContent'
import FolderContent from './components/FolderContent'
import SearchPanel from './components/SearchPanel'
import MarkdownImport from './components/MarkdownImport'

const { Sider, Content } = Layout

function AppLayout(): JSX.Element {
  const { selectedNode, refreshTree, selectNode, treeVersion, isDark, toggleTheme, bumpDataVersion } = useAppContext()
  const { token } = theme.useToken()
  const [initialLoading, setInitialLoading] = useState(true)
  const [mdImportVisible, setMdImportVisible] = useState(false)
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null)

  const loadGlobalStats = useCallback(async () => {
    const stats = await window.api.stats.global()
    setGlobalStats(stats)
  }, [])

  useEffect(() => {
    (async () => {
      await window.api.tree.get()
      setInitialLoading(false)
      refreshTree()
    })()
  }, [])

  useEffect(() => {
    loadGlobalStats()
  }, [loadGlobalStats, treeVersion])

  const handleExport = async () => {
    const result = await window.api.markdown.export()
    if (result.success) {
      message.success('导出成功')
    }
  }

  const handleNewFolder = () => {
    const parentId = selectedNode?.type === 'folder' ? selectedNode.id : undefined
    let name = ''
    Modal.confirm({
      title: '新建文件夹',
      autoFocusButton: null,
      content: (
          <AutoFocusInput
            placeholder="输入文件夹名称"
            onChange={e => { name = e.target.value }}
          onKeyDown={submitOnEnter}
        />
      ),
      onOk: async () => {
        if (!name.trim()) return
        await window.api.folder.create({ name: name.trim(), parentId })
        await refreshTree()
        message.success('文件夹已创建')
      }
    })
  }

  const handleNewSheet = () => {
    const folderId = selectedNode?.type === 'folder' ? selectedNode.id : undefined
    const hint = folderId ? `（将在"${selectedNode!.name}"下创建）` : '（将创建在根目录）'
    let name = ''
    Modal.confirm({
      title: '新建题单',
      autoFocusButton: null,
      content: (
        <div>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>{hint}</Typography.Text>
          <AutoFocusInput
            placeholder="输入题单名称"
            onChange={e => { name = e.target.value }}
            onKeyDown={submitOnEnter}
          />
        </div>
      ),
      onOk: async () => {
        if (!name.trim()) return
        const result = await window.api.sheet.create({ name: name.trim(), folderId })
        selectNode({ id: result.id, type: 'sheet', name: name.trim() })
        await refreshTree()
        message.success('题单已创建')
      }
    })
  }

  const renderContent = () => {
    if (!selectedNode) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: token.colorTextQuaternary }}>
          <Typography.Text type="secondary">选择一个文件夹或题单开始</Typography.Text>
        </div>
      )
    }
    if (selectedNode.type === 'sheet') {
      return <SheetContent sheetId={selectedNode.id} activePartId={selectedNode.partId} />
    }
    if (selectedNode.type === 'folder') {
      return <FolderContent folderId={selectedNode.id} />
    }
    return null
  }

  const renderGlobalStats = () => {
    if (!globalStats) return null
    const rate = globalStats.totalProblems > 0
      ? Math.round((globalStats.completedProblems / globalStats.totalProblems) * 100) : 0
    return (
      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
        全局 {globalStats.completedProblems}/{globalStats.totalProblems} ({rate}%)
      </Typography.Text>
    )
  }

  if (initialLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: token.colorBgContainer }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <Layout style={{ height: '100vh', background: token.colorBgContainer }}>
      <Sider width={320} style={{ background: token.colorBgContainer, borderRight: `1px solid ${token.colorBorderSecondary}`, overflow: 'auto', minHeight: 0 }}>
        <div style={{ minHeight: '100%', background: token.colorBgContainer }} onClick={() => selectNode(null)}>
          <div style={{ padding: '16px', borderBottom: `1px solid ${token.colorBorderSecondary}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }} onClick={e => e.stopPropagation()}>
            <div>
              <Typography.Title level={5} style={{ margin: 0, cursor: 'pointer' }} onClick={() => selectNode(null)}>TODO列表</Typography.Title>
              {renderGlobalStats()}
            </div>
            <Space direction="vertical" size={4} align="end">
              <Button size="small" icon={<ExportOutlined />} onClick={handleExport}>导出</Button>
              <Switch
                checkedChildren={<MoonOutlined />}
                unCheckedChildren={<SunOutlined />}
                checked={isDark}
                onChange={toggleTheme}
                size="small"
              />
            </Space>
          </div>
          <div style={{ padding: '8px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}` }} onClick={e => e.stopPropagation()}>
            <Space size={4}>
              <Button size="small" icon={<FolderAddOutlined />} onClick={handleNewFolder}>新建文件夹</Button>
              <Button size="small" icon={<OrderedListOutlined />} onClick={handleNewSheet}>新建题单</Button>
              <Button size="small" icon={<ImportOutlined />} onClick={() => setMdImportVisible(true)}>导入</Button>
            </Space>
          </div>
          <div onClick={e => e.stopPropagation()}><SearchPanel /></div>
          <div onClick={e => e.stopPropagation()}><DirectoryTree /></div>
        </div>
      </Sider>
      <Layout style={{ minHeight: 0, background: token.colorBgContainer }}>
        <Content style={{ padding: '24px', overflow: 'auto', background: token.colorBgContainer, minHeight: 0 }}>
          {renderContent()}
        </Content>
      </Layout>
      <MarkdownImport
        visible={mdImportVisible}
        onClose={() => setMdImportVisible(false)}
        targetFolderId={selectedNode?.type === 'folder' ? selectedNode.id : undefined}
        sheetId={selectedNode?.type === 'sheet' ? selectedNode.id : undefined}
        activePartId={selectedNode?.partId}
        onImported={() => { refreshTree(); bumpDataVersion(); setMdImportVisible(false); loadGlobalStats() }}
      />
    </Layout>
  )
}

function AppThemeWrapper(): JSX.Element {
  const { isDark } = useAppContext()
  return (
    <ConfigProvider theme={{ algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm }}>
      <AppLayout />
    </ConfigProvider>
  )
}

export default function App(): JSX.Element {
  return (
    <AppProvider>
      <AppThemeWrapper />
    </AppProvider>
  )
}
