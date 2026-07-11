import { useState, useRef, useEffect, useCallback } from 'react'
import type { JSX } from 'react'

interface VoicePlayerProps {
  sessionId: string
  localId: number
  createTime: number
  svrId?: string | number
  duration?: number
}

let globalCurrentAudio: HTMLAudioElement | null = null
let globalStopCallback: (() => void) | null = null

export function VoicePlayer({
  sessionId,
  localId,
  createTime,
  svrId
}: VoicePlayerProps): JSX.Element {
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audioDuration, setAudioDuration] = useState<number | undefined>(undefined)
  const [shouldAutoPlay, setShouldAutoPlay] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const stopCurrentAndPlay = useCallback((audio: HTMLAudioElement) => {
    if (globalCurrentAudio && globalCurrentAudio !== audio) {
      globalCurrentAudio.pause()
      globalCurrentAudio.currentTime = 0
      globalStopCallback?.()
    }
    globalCurrentAudio = audio
  }, [])

  const handlePlayPause = useCallback(async () => {
    // 如果还没有音频数据，先获取
    if (!audioUrl && !loading) {
      setLoading(true)
      setShouldAutoPlay(true)
      console.log('[VoicePlayer] fetching voice data:', { sessionId, localId, createTime })
      try {
        const result = await window.api.getVoiceData(sessionId, localId, createTime, svrId)
        console.log('[VoicePlayer] got result:', result)
        if (result.success && result.data) {
          console.log('[VoicePlayer] setting audioUrl, data length:', result.data.length)
          // 使用 Blob URL 替代 data URL，绕过 CSP 限制
          const byteCharacters = atob(result.data)
          const byteNumbers = new Array(byteCharacters.length)
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i)
          }
          const byteArray = new Uint8Array(byteNumbers)
          const blob = new Blob([byteArray], { type: 'audio/wav' })
          const blobUrl = URL.createObjectURL(blob)
          console.log('[VoicePlayer] created blob URL:', blobUrl)
          setAudioUrl(blobUrl)
        } else {
          console.log('[VoicePlayer] getVoiceData failed:', result.error)
          setError(result.error || '获取语音数据失败')
          setShouldAutoPlay(false)
        }
      } catch (e) {
        console.log('[VoicePlayer] exception:', e)
        setError('加载语音失败')
        setShouldAutoPlay(false)
      }
      setLoading(false)
      return
    }

    if (!audioRef.current) {
      console.log('[VoicePlayer] no audioRef')
      return
    }

    const audio = audioRef.current

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
      globalStopCallback = null
    } else {
      stopCurrentAndPlay(audio)
      audio
        .play()
        .then(() => {
          console.log('[VoicePlayer] play() succeeded')
        })
        .catch((e) => {
          console.log('[VoicePlayer] play() failed:', e)
        })
      setIsPlaying(true)
      globalStopCallback = () => {
        setIsPlaying(false)
        audio.currentTime = 0
      }
    }
  }, [audioUrl, loading, isPlaying, sessionId, localId, createTime, svrId, stopCurrentAndPlay])

  useEffect(() => {
    if (!audioUrl) return

    let audio = audioRef.current
    if (!audio) {
      audio = new Audio(audioUrl)
      audioRef.current = audio
    }

    const audioEl = audio!

    audioEl.addEventListener('loadedmetadata', () => {
      setAudioDuration(audioEl.duration)
      console.log('[VoicePlayer] loadedmetadata, duration:', audioEl.duration)
    })

    audioEl.addEventListener('ended', () => {
      setIsPlaying(false)
      globalStopCallback = null
    })

    audioEl.addEventListener('timeupdate', () => {
      if (audioEl.duration && isFinite(audioEl.duration)) {
        setAudioDuration(audioEl.duration)
      }
    })

    audioEl.addEventListener('canplay', () => {
      console.log('[VoicePlayer] canplay event, shouldAutoPlay:', shouldAutoPlay)
      if (shouldAutoPlay && audioRef.current) {
        setShouldAutoPlay(false)
        stopCurrentAndPlay(audioRef.current)
        audioRef.current.play()
        setIsPlaying(true)
        globalStopCallback = () => {
          setIsPlaying(false)
          if (audioRef.current) {
            audioRef.current.currentTime = 0
          }
        }
      }
    })

    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
      if (globalCurrentAudio === audioRef.current) {
        globalCurrentAudio = null
        globalStopCallback = null
      }
    }
  }, [audioUrl, shouldAutoPlay, stopCurrentAndPlay])

  const formatDuration = (seconds: number | undefined): string => {
    if (!seconds || !isFinite(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="voice-message voice-loading">
        <span className="voice-icon">▶</span>
        <span className="voice-loading-text">加载中...</span>
      </div>
    )
  }

  if (error && !audioUrl) {
    return (
      <div className="voice-message voice-error" onClick={handlePlayPause}>
        <span className="voice-icon">▶</span>
        <span className="voice-error-text">当前版本暂不支持播放</span>
      </div>
    )
  }

  return (
    <div className="voice-message" onClick={handlePlayPause}>
      <span className={`voice-icon ${isPlaying ? 'playing' : ''}`}>{isPlaying ? '⏸' : '▶'}</span>
      <div className="voice-bars" aria-hidden="true">
        <i></i>
        <i></i>
        <i></i>
      </div>
      <span className="voice-duration">{formatDuration(audioDuration)}</span>
    </div>
  )
}
