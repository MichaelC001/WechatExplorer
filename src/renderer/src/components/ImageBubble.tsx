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
  const [upgrading, setUpgrading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isThumbnail, setIsThumbnail] = useState(false)
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
      if (result.success && result.data?.startsWith('data:image/')) {
        setImageUrl(result.data)
        setIsThumbnail(Boolean(result.isThumb))
        setError(null)
      } else {
        setError(result.error || '加载图片失败')
      }
    } catch {
      setError('加载图片失败')
    } finally {
      setLoading(false)
    }
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
    if (!imageUrl) return
    await window.api.copyImage(imageUrl)
    alert('图片已复制')
  }

  const handleClick = async (): Promise<void> => {
    if (!imageUrl && !error) return
    if (!imageMd5 && !imageDatName) {
      if (imageUrl) onImageClick?.(imageUrl)
      return
    }

    if (upgrading) {
      if (imageUrl) onImageClick?.(imageUrl)
      return
    }

    setUpgrading(true)
    try {
      const result = await window.api.getImage(imageMd5, imageDatName || isThumb, sessionId, {
        force: true
      })
      if (result.success && result.data?.startsWith('data:image/')) {
        setImageUrl(result.data)
        setIsThumbnail(Boolean(result.isThumb))
        setError(null)
        onImageClick?.(result.data)
        return
      }
    } catch {
      // Fall back to the already visible image.
    } finally {
      setUpgrading(false)
    }

    if (imageUrl) onImageClick?.(imageUrl)
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
        <div className="image-error-text">{error || '图片未加载'}</div>
      </div>
    )
  }

  if (!imageUrl) {
    return (
      <div ref={containerRef} className="image-bubble image-placeholder">
        <div className="image-placeholder-icon">图</div>
        <div className="image-placeholder-text">加载图片中...</div>
      </div>
    )
  }

  return (
    <div className="image-bubble image-loaded" onClick={handleClick}>
      <img src={imageUrl} alt="图片" className="image-content" />
      {(upgrading || isThumbnail) && (
        <div className="image-quality-badge">{upgrading ? '查找原图...' : '缩略图'}</div>
      )}
      <div className="image-actions">
        <button className="image-action-btn" onClick={handleCopy} title="复制图片">
          复制
        </button>
      </div>
    </div>
  )
}
