import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentInfo,
  AttachmentRemove,
  type AttachmentData,
} from '@/components/ai-elements/attachments'
import type { AttachedFile } from '@/types'

interface AttachmentsAdapterProps {
  files: AttachedFile[]
  onRemove?: (index: number) => void
  variant?: 'grid' | 'inline' | 'list'
  className?: string
}

/**
 * 将项目中的 AttachedFile 转换为 AI SDK Elements 的 AttachmentData
 */
function convertToAttachmentData(files: AttachedFile[]): AttachmentData[] {
  return files.map((file, index) => ({
    type: 'file' as const,
    id: `file-${index}-${file.name}`,
    filename: file.name,
    mediaType: file.type,
    url: file.data, // base64 data URL
  }))
}

/**
 * AttachmentsAdapter - 适配当前项目的 AttachedFile 类型到 AI SDK Elements
 *
 * 特点：
 * - grid: 适合消息中的附件显示（缩略图网格）
 * - inline: 适合输入框中的紧凑显示
 * - list: 适合文件列表（显示完整信息）
 */
export function AttachmentsAdapter({
  files,
  onRemove,
  variant = 'grid',
  className,
}: AttachmentsAdapterProps) {
  if (files.length === 0) return null

  const attachmentData = convertToAttachmentData(files)

  return (
    <Attachments variant={variant} className={className}>
      {attachmentData.map((data, index) => (
        <Attachment
          key={data.id}
          data={data}
          onRemove={onRemove ? () => onRemove(index) : undefined}
        >
          <AttachmentPreview />
          {variant !== 'grid' && <AttachmentInfo />}
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  )
}

/**
 * 用户消息中的附件显示组件
 * 使用 grid 布局，类似当前实现的缩略图样式
 */
export function MessageAttachments({
  files,
  className,
}: {
  files: AttachedFile[]
  className?: string
}) {
  if (files.length === 0) return null

  const attachmentData = convertToAttachmentData(files)

  return (
    <Attachments variant="grid" className={className}>
      {attachmentData.map((data) => (
        <Attachment key={data.id} data={data}>
          <AttachmentPreview />
        </Attachment>
      ))}
    </Attachments>
  )
}

/**
 * 输入框中的附件预览组件
 * 使用 inline 布局，紧凑显示，支持删除
 */
export function InputAttachments({
  files,
  onRemove,
  className,
}: {
  files: AttachedFile[]
  onRemove: (index: number) => void
  className?: string
}) {
  if (files.length === 0) return null

  const attachmentData = convertToAttachmentData(files)

  return (
    <Attachments variant="inline" className={className}>
      {attachmentData.map((data, index) => (
        <Attachment
          key={data.id}
          data={data}
          onRemove={() => onRemove(index)}
        >
          <AttachmentPreview />
          <AttachmentInfo />
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  )
}
