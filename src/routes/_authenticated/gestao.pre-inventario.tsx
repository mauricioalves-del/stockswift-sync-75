import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/gestao/pre-inventario')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authenticated/gestao/pre-inventario"!</div>
}
