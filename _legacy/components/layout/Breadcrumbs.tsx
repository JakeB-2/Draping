"use client"

import React, { useMemo } from "react"
import { usePathname } from "next/navigation"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { ROUTE_TREE, RouteTree, RouteNode } from "@/lib/routes"

function formatFallbackLabel(segment: string) {
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function buildBreadcrumbItems(pathname: string) {
  const segments = pathname.split("/").filter(Boolean)
  const items: { href: string; label: string }[] = []

  let currentTree: RouteTree | undefined = ROUTE_TREE

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const href = `/${segments.slice(0, i + 1).join("/")}`

    if (!currentTree) {
      items.push({ href, label: formatFallbackLabel(segment) })
      continue
    }

    const node: RouteNode | undefined = currentTree[segment] ?? currentTree["[id]"]

    if (node) {
      items.push({ href, label: node.label })
      currentTree = node.children
    } else {
      items.push({ href, label: formatFallbackLabel(segment) })
      currentTree = undefined
    }
  }

  return items
}

export default function Breadcrumbs() {
  const pathname = usePathname()
  const items = useMemo(() => {
    if (!pathname || pathname === "/") return []
    return buildBreadcrumbItems(pathname)
  }, [pathname])

  if (items.length <= 1) return null

  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        {items.map((item, index) => (
          <React.Fragment key={item.href}>
            <BreadcrumbItem>
              <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
            </BreadcrumbItem>
            {index < items.length - 1 ? <BreadcrumbSeparator /> : null}
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
