import { useEffect, useRef } from 'react'
import { Input } from 'antd'
import type { InputRef } from 'antd'

export function AutoFocusInput(props: Record<string, unknown>) {
  const ref = useRef<InputRef>(null)
  useEffect(() => {
    const timer = setTimeout(() => ref.current?.focus(), 200)
    return () => clearTimeout(timer)
  }, [])
  return <Input ref={ref} {...props} />
}

export function AutoFocusTextArea(props: Record<string, unknown>) {
  const ref = useRef<InputRef>(null)
  useEffect(() => {
    const timer = setTimeout(() => ref.current?.focus(), 200)
    return () => clearTimeout(timer)
  }, [])
  return <Input.TextArea ref={ref} {...props} />
}
