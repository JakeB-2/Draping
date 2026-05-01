'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { ROUTE_TREE, type RouteTree } from '@/lib/routes'

type Crumb = { label: string; href: string }

function buildCrumbs(segments: string[], tree: RouteTree, basePath: string): Crumb[] {
  const crumbs: Crumb[] = []
  let currentTree: RouteTree | undefined = tree
  let path = basePath

  for (const seg of segments) {
    if (!currentTree) break
    const node: RouteTree[string] | undefined = currentTree[seg] ?? currentTree['[id]']
    if (!node) break
    path = `${path}/${seg}`
    crumbs.push({ label: node.label, href: path })
    currentTree = node.children
  }

  return crumbs
}

export default function AdminBreadcrumbs() {
  const pathname = usePathname()
  if (!pathname.startsWith('/admin')) return null

  const segments = pathname.replace(/^\//, '').split('/')
  const adminNode = ROUTE_TREE['admin']
  if (!adminNode) return null

  const rootCrumb: Crumb = { label: 'Admin', href: '/admin' }
  const rest = buildCrumbs(segments.slice(1), adminNode.children ?? {}, '/admin')
  const crumbs = [rootCrumb, ...rest]

  if (crumbs.length <= 1) return null

  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <React.Fragment key={crumb.href}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
