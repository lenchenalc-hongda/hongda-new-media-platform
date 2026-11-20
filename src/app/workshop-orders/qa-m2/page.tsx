import type { Metadata } from 'next';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import LiveQaM2OrderPicker from '@/components/workshop-orders/LiveQaM2OrderPicker';
import { isWosP2M2QaEnabled } from '@/lib/workshop-orders/p2-m2-action-contract';

export const metadata:Metadata={
 title:'WOS M2 QA · 物料与签样双人确认 | 宏达车间',
 description:'仅在单独批准的隔离非生产 QA 环境操作，所有成功回执仍禁止自动开工。',
};
export const dynamic='force-dynamic';

/** Never inherits P7, legacy P2 or read-only QA flags. */
export default function WosM2QaPage() {
 const enabled=process.env.AUTH_MODE==='supabase'
   &&isWosP2M2QaEnabled({
      vercelEnv:process.env.VERCEL_ENV,flag:process.env.WOS_P2_M2_QA_MUTATIONS_ENABLED,
      supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL,
   })&&process.env.NEXT_PUBLIC_WOS_P2_M2_QA_MUTATIONS_ENABLED==='true';
 return <AppLayout>
   <PageHeader title="WOS M2 · 受控物料登记与签样双人确认"
     description="仅单独审批的 QA 合成订单和临时数据库 Gate；本功能永远不能自动开工。"/>
   {enabled?<LiveQaM2OrderPicker/>:<p role="status" className="rounded border border-amber-300 p-4 text-sm text-amber-900">
    M2 QA 操作入口未授权。需隔离 Preview、真实 Supabase Auth、准确 QA 项目及独立的客户端/服务器/数据库 Gate。
    当前不查询或修改任何订单；不会继承旧 P2、P7 和只读入口权限。
   </p>}
 </AppLayout>;
}
