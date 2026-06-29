import { useState, useCallback, useEffect, useRef } from 'react'
import type { JSX, MouseEvent } from 'react'

interface ImageBubbleProps {
  imageMd5?: string
  imageDatName?: string
  sessionId?: string
  isThumb?: boolean
  onImageClick?: (imageUrl: string) => void
}

export function ImageBubble({
  imageMd5,
  imageDatName,
  sessionId,
  isThumb = false,
  onImageClick
}: ImageBubbleProps): JSX.Element {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const loadImage = useCallback(async () => {
    if (imageUrl || loading) return
    if (!imageMd5 && !imageDatName) {
      setError('缺少图片标识')
      return
    }

    setLoading(true)
    try {
      const result = await window.api.getImage(imageMd5, imageDatName || isThumb, sessionId)
      if (result.success && result.data) {
        // 验证返回的是否是有效的图片 data URL
        if (result.data.startsWith('data:image/')) {
          setImageUrl(result.data)
          setError(null)
        } else {
          // 解密后不是有效图片格式，显示未解密
          setError('未解密')
        }
      } else {
        setError(result.error || '加载图片失败')
      }
    } catch {
      setError('加载图片失败')
    }
    setLoading(false)
  }, [imageMd5, imageDatName, sessionId, isThumb, imageUrl, loading])

  useEffect(() => {
    if (imageUrl || loading || error) return
    const element = containerRef.current
    if (!element || typeof IntersectionObserver === 'undefined') {
      const timer = window.setTimeout(() => void loadImage(), 0)
      return () => window.clearTimeout(timer)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        void loadImage()
      },
      { rootMargin: '400px 0px' }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [error, imageUrl, loadImage, loading])

  const handleCopy = async (event: MouseEvent): Promise<void> => {
    event.stopPropagation()
    if (imageUrl) {
      await window.api.copyImage(imageUrl)
      alert('图片已复制')
    }
  }

  const handleClick = (): void => {
    if (imageUrl) {
      onImageClick?.(imageUrl)
    }
  }

  if (loading) {
    return (
      <div className="image-bubble image-loading" onClick={handleClick}>
        <div className="image-loading-spinner">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="image-bubble image-error" onClick={loadImage}>
        <div className="image-error-text">图片未加载</div>
      </div>
    )
  }

  if (!imageUrl) {
    return (
      <div ref={containerRef} className="image-bubble image-placeholder">
        <div className="image-placeholder-icon">🖼</div>
        <div className="image-placeholder-text">加载图片中</div>
      </div>
    )
  }

  return (
    <div className="image-bubble image-loaded" onClick={handleClick}>
      <img src={imageUrl} alt="图片" className="image-content" />
      <div className="image-actions">
        <button className="image-action-btn" onClick={handleCopy} title="复制图片">
          📋
        </button>
      </div>
    </div>
  )
}
