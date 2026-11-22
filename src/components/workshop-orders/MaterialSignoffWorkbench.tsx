import type {
  WosM4MaterialEvidence,
  WosM4MaterialSignoffResult,
  WosM4SignerEvidence,
} from '@/lib/workshop-orders/m4-material-signoff';
import { WOS_QA_IMAGE_CATEGORIES } from '@/lib/workshop-orders/qa-image-categories';

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '未登记';
  return String(value);
}

function dateTime(value: string | null): string {
  if (!value) return '未登记';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('zh-CN') : '时间无效';
}

function materialTone(material: WosM4MaterialEvidence): string {
  return material.ready
    ? 'border-emerald-200 bg-emerald-50'
    : 'border-amber-200 bg-amber-50';
}

function Signer({ signer }: { signer: WosM4SignerEvidence }) {
  const role = signer.role === 'OFFICE' ? '办公室' : '车间';
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-gray-900">{role}签认</p>
        <span className={signer.digestPresent && signer.confirmedAt
          ? 'text-emerald-800' : 'text-amber-900'}>
          {signer.digestPresent && signer.confirmedAt ? '证据已登记' : '尚未完成'}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-gray-700">
        <dt>人员</dt>
        <dd className="break-words">
          {signer.displayName || signer.profileId || '未登记'}
          {!signer.profileVisible && signer.profileId ? '（档案权限受限）' : ''}
        </dd>
        <dt>角色</dt>
        <dd>{display(signer.profileRole)}</dd>
        <dt>签认时间</dt>
        <dd>{dateTime(signer.confirmedAt)}</dd>
        <dt>绑定订单版本</dt>
        <dd>{signer.postOrderVersion === null ? '未登记' : 'v' + signer.postOrderVersion}</dd>
        <dt>proof-set 摘要</dt>
        <dd>{signer.digestPresent ? '已登记' : '缺失'}</dd>
      </dl>
    </div>
  );
}

export default function MaterialSignoffWorkbench({
  workbench,
}: {
  workbench: WosM4MaterialSignoffResult;
}) {
  const baseline = workbench.currentBaseline;
  const currentSelected = workbench.images.filter(image => image.selectedInCurrentBaseline);
  return (
    <section className="space-y-4 rounded-md border border-slate-300 bg-slate-50 p-4"
      aria-label="物料齐套、现版图片与双签工作台">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-950">物料齐套与现版签样</h4>
          <p className="mt-1 text-xs text-slate-700">
            生产资料版本 {workbench.versionLabel} · 事务版本 v{workbench.transactionVersion} ·
            当前状态 {workbench.workflowStatus}
          </p>
        </div>
        <span className="rounded bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
          canStart=false
        </span>
      </header>

      <div className="grid gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-slate-500">四类物料</p>
          <p className="mt-1 font-semibold text-slate-950">
            {workbench.materials.filter(material => material.ready).length} / 4 已满足记录条件
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-slate-500">CURRENT 基准</p>
          <p className="mt-1 font-semibold text-slate-950">
            {baseline.count === 1 ? '唯一' : baseline.count === 0 ? '未建立' : '冲突'}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-slate-500">历史 M2 双签证据</p>
          <p className={baseline.historicalM2EvidenceComplete
            ? 'mt-1 font-semibold text-emerald-800'
            : 'mt-1 font-semibold text-amber-900'}>
            {baseline.historicalM2EvidenceComplete ? '事务链完整' : '未形成完整闭环'}
          </p>
        </div>
      </div>

      {workbench.gaps.length > 0 && (
        <section className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <h5 className="text-xs font-semibold text-amber-950">当前缺口与下一步</h5>
          <p className="mt-1 text-xs font-medium text-amber-950">{workbench.nextAction}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-900">
            {workbench.gaps.map((gap, index) => <li key={gap + ':' + index}>{gap}</li>)}
          </ul>
        </section>
      )}

      <section>
        <h5 className="text-xs font-semibold text-slate-950">四类物料齐套明细</h5>
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {workbench.materials.map(material => (
            <article key={material.code}
              className={'rounded-md border p-3 text-xs ' + materialTone(material)}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate-950">{material.title}</p>
                <span className={material.ready ? 'text-emerald-800' : 'text-amber-900'}>
                  {material.ready ? '记录条件已满足' : '未齐套'}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-slate-700">
                <dt>当前状态</dt><dd>{display(material.status)}</dd>
                <dt>认可状态</dt><dd>{material.acceptedStatus}</dd>
                <dt>物料版本</dt><dd>{display(material.versionLabel)}</dd>
                <dt>版本匹配</dt><dd>{material.versionMatched ? '是' : '否'}</dd>
                <dt>预计到位</dt><dd>{dateTime(material.expectedAt)}</dd>
                <dt>实际到位</dt><dd>{dateTime(material.arrivedAt)}</dd>
                {material.code === 'INCOMING_MATERIAL' && (
                  <>
                    <dt>应到 / 实到</dt>
                    <dd>{display(material.quantityExpected)} / {display(material.quantityArrived)}</dd>
                    <dt>数量缺口</dt>
                    <dd>{material.quantityShortfall === null ? '未核实' : material.quantityShortfall}</dd>
                  </>
                )}
                <dt>核对人员</dt>
                <dd className="break-words">
                  {material.confirmerName || material.confirmerProfileId || '尚未确认'}
                  {material.confirmerRole ? ' / ' + material.confirmerRole : ''}
                </dd>
                <dt>确认时间</dt><dd>{dateTime(material.confirmedAt)}</dd>
                <dt>异常说明</dt><dd>{display(material.note)}</dd>
              </dl>
              {!material.ready && (
                <p className="mt-2 border-t border-amber-200 pt-2 text-amber-950">
                  缺少的下一项证据：{material.nextEvidence}
                </p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-slate-300 bg-white p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h5 className="text-xs font-semibold text-slate-950">现版图片与 CURRENT 基准</h5>
            <p className="mt-1 text-xs text-slate-600">
              {baseline.count === 1
                ? `基准 ${baseline.id} · ${baseline.versionLabel}`
                : '尚未取得唯一 CURRENT 基准'}
            </p>
          </div>
          <span className={baseline.versionMatched ? 'text-xs text-emerald-800' : 'text-xs text-amber-900'}>
            {baseline.versionMatched ? '版本匹配' : '版本未匹配'}
          </span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {WOS_QA_IMAGE_CATEGORIES.map(category => {
            const selected = currentSelected.filter(image => image.category === category);
            const currentValid = selected.filter(image => image.currentReady);
            const candidates = workbench.images.filter(image => image.category === category);
            return (
              <div key={category} className="rounded-md border border-slate-200 p-3 text-xs">
                <p className="font-semibold text-slate-900">{candidates[0]?.categoryLabel || category}</p>
                <p className={currentValid.length === 1 ? 'mt-1 text-emerald-800' : 'mt-1 text-amber-900'}>
                  {currentValid.length === 1
                    ? '已进入当前基准'
                    : selected.length === 0
                      ? '未进入当前基准'
                      : selected.length > 1 ? '重复关联' : '已关联但当前版本无效'}
                </p>
                {candidates.length === 0 ? (
                  <p className="mt-1 text-slate-600">未上传</p>
                ) : candidates.map(image => (
                  <div key={image.id} className="mt-2 border-t border-slate-100 pt-2 text-slate-600">
                    <p className="break-all">{image.fileName}</p>
                    <p className="mt-1">
                      {image.versionLabel} · {image.imageStatus} ·{' '}
                      {image.versionMatched ? '版本一致' : '版本不一致'}
                    </p>
                    {image.superseded && <p className="text-amber-800">已替代</p>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <p className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-950">
          私有对象 SHA-256 证明当前未对普通 authenticated RLS 开放读取。
          历史基准只能作为历史签认证据，不能据此显示现版绿色通过。
        </p>
      </section>

      <section>
        <h5 className="text-xs font-semibold text-slate-950">Office / Workshop 独立双签</h5>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <Signer signer={baseline.office} />
          <Signer signer={baseline.workshop} />
        </div>
        <div className="mt-2 grid gap-1 rounded-md bg-white p-3 text-xs text-slate-700 sm:grid-cols-2">
          <p>独立签认人：{baseline.independentSigners ? '通过' : '未通过'}</p>
          <p>签认角色与事务操作者：{baseline.signerRoleVerifiedFromHistory ? '可信对应' : '未通过'}</p>
          <p>同一 proof-set：{baseline.proofSetDigestMatch ? '摘要一致' : '未一致'}</p>
          <p>签认版本连续性：{baseline.postOrderVersionsValid ? '通过' : '未通过'}</p>
          <p>四类图片类别：{baseline.requiredCategoriesComplete ? '完整' : '缺失'}</p>
          <p className="sm:col-span-2 text-amber-950">
            当前私有 proof 复核：不可验证。普通会话无权读取
            `wos_qa_verified_image_proofs`，不得把历史摘要或文件存在等同于当前 proof 有效。
          </p>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-3">
        <h5 className="text-xs font-semibold text-slate-950">M2 只读事务历史</h5>
        {workbench.m2History.actions.length === 0 ? (
          <p className="mt-1 text-xs text-slate-600">尚无基线选择与双签事务记录。</p>
        ) : (
          <ol className="mt-2 space-y-1 text-xs text-slate-700">
            {workbench.m2History.actions.map(action => (
              <li key={action.action} className="rounded bg-slate-50 p-2">
                {action.label} · {action.actorRole} · v
                {action.expectedVersion ?? '?'} → v{action.newVersion ?? '?'} ·{' '}
                {dateTime(action.createdAt)}
                {action.requestId ? ' · 请求 ' + action.requestId.slice(0, 8) : ''}
              </li>
            ))}
          </ol>
        )}
        <p className={workbench.m2History.chainComplete
          ? 'mt-2 text-xs text-emerald-800'
          : 'mt-2 text-xs text-amber-900'}>
          {workbench.m2History.chainComplete
            ? 'M2 状态历史形成连续版本链；仅作为历史审计证据。'
            : workbench.m2History.issue || 'M2 事务历史尚未形成连续版本链。'}
        </p>
      </section>

      {workbench.issues.length > 0 && (
        <section className="rounded-md border border-red-200 bg-red-50 p-3">
          <h5 className="text-xs font-semibold text-red-950">只读安全阻断</h5>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-red-900">
            {workbench.issues.map((issue, index) => <li key={issue + ':' + index}>{issue}</li>)}
          </ul>
        </section>
      )}

      <p className="rounded-md border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-900">
        本工作台只读。物料记录、CURRENT 基准选择、双签和最终齐套均不能在普通 Inbox 中写入；
        即使历史 M2 证据完整，也必须经过独立 proof 复核与人工生产放行，canStart 始终为 false。
      </p>
    </section>
  );
}
