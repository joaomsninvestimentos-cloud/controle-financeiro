import { redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/auth'
import FinanceApp from '@/components/FinanceApp'

export default async function Home() {
  const ctx = await getAuthContext()
  if (!ctx.authorized) {
    redirect('/login')
  }
  return <FinanceApp user={ctx.user} />
}
