import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/atlas/mbr')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authenticated/atlas/mbr"!</div>
}
