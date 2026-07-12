import { API_ENDPOINTS } from '../model/apiEndpoints'
import { type ReactElement } from 'react'

export function EndpointCatalog({
  activeEndpointId,
  onSelect,
  onCopy
}: {
  activeEndpointId: string
  onSelect: (id: string) => void
  onCopy: (path: string) => Promise<void>
}): ReactElement {
  return (
    <section className="api-endpoint-catalog">
      <div className="api-section-heading">
        <h2>接口能力</h2>
        <span>真实本地接口</span>
      </div>
      <div className="api-endpoint-table">
        <div className="api-endpoint-head">
          <span>方法</span>
          <span>路径</span>
          <span>说明</span>
          <span>操作</span>
        </div>
        {API_ENDPOINTS.map((endpoint) => (
          <div
            className={`api-endpoint-row ${activeEndpointId === endpoint.id ? 'active' : ''}`}
            key={endpoint.id}
          >
            <span className={`api-method ${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
            <div>
              <code>{endpoint.path}</code>
              {endpoint.parameters?.some((item) => item.required) && <small>含必要参数</small>}
            </div>
            <span>
              {endpoint.name}
              <small>{endpoint.description}</small>
            </span>
            <span>
              <button type="button" onClick={() => void onCopy(endpoint.path)}>
                复制
              </button>
              <button type="button" onClick={() => onSelect(endpoint.id)}>
                测试
              </button>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
