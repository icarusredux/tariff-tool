"use client"

import React from "react"
import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Search, TrendingUp, TrendingDown, Users, Package, Download } from "lucide-react"
import { Button } from "@/components/ui/button"

// CSV URL Constants
const CSV_URLS = {
  ORIGINAL_2024:
    "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Custom_Values_HTS6_By_Countries_2024-EI4TvIXg9UU4LQE570Js8QMy1c6IEl.csv",
  WITH_TARIFFS: "https://pi8sub4psrlksl2r.public.blob.vercel-storage.com/flows_revised_competitive_effect.csv",
} as const

interface TradeData {
  "HTS Number": string
  Description: string
  [country: string]: string
}

interface CountryAnalysis {
  product: string
  htsNumber: string
  description: string
  originalValue: number
  tariffValue: number
  gain: number
  percentageChange: number
}

interface CountryComparison {
  country: string
  originalImports: number
  tariffImports: number
  totalGain: number
  percentageGain: number
}

interface ProductAnalysis {
  country: string
  htsNumber: string
  description: string
  originalValue: number
  tariffValue: number
  gain: number
  percentageChange: number
}

type SortBy = "gain" | "percentage" | "original" | "tariff"

function useTableSort(initialSort: SortBy = "gain") {
  const [sortBy, setSortBy] = useState<SortBy>(initialSort)
  return { sortBy, setSortBy }
}

function SortableTableHeader({
  label,
  sortKey,
  currentSort,
  onSortChange,
  align = "left",
  className = "",
}: {
  label: string
  sortKey: SortBy
  currentSort: SortBy
  onSortChange: (sort: SortBy) => void
  align?: "left" | "right"
  className?: string
}) {
  return (
    <TableHead className={`${align === "right" ? "text-right" : ""} ${className}`}>
      <button
        onClick={() => onSortChange(sortKey)}
        className={`hover:text-foreground ${
          currentSort === sortKey ? "text-foreground font-semibold" : "text-muted-foreground"
        }`}
      >
        {label}
      </button>
    </TableHead>
  )
}

const downloadCSV = (data: any[], filename: string, headers: string[], queryDescription?: string) => {
  const csvLines = []

  // Add query description as first row if provided
  if (queryDescription) {
    // Create a row with the query description followed by commas to match column count
    const queryRow = queryDescription + ",".repeat(Math.max(0, headers.length - 1))
    csvLines.push(queryRow)
  }

  csvLines.push(headers.join(","))
  csvLines.push(
    ...data.map((row) =>
      headers
        .map((header) => {
          const value =
            row[header.toLowerCase().replace(/[^a-z0-9]/g, "")] || row[header] || row[header.toLowerCase()] || ""
          // Escape commas and quotes in CSV values
          return typeof value === "string" && (value.includes(",") || value.includes('"'))
            ? `"${value.replace(/"/g, '""')}"`
            : value
        })
        .join(","),
    ),
  )

  const csvContent = csvLines.join("\n")
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}.csv`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

const createCSVDownloadHandler = (
  getData: () => any[],
  getFilename: () => string,
  getHeaders: () => string[],
  getQueryDescription?: () => string,
) => {
  return () => {
    const csvData = getData()
    const filename = getFilename()
    const headers = getHeaders()
    const queryDescription = getQueryDescription?.()
    downloadCSV(csvData, filename, headers, queryDescription)
  }
}

const generateFilename = (title: string) => {
  return `${title.toLowerCase().replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}`
}

const getColorClass = (isLosing: boolean) => (isLosing ? "text-red-600" : "text-green-600")

const createSortedData = <
  T extends { gain: number; percentageChange: number; originalValue: number; tariffValue: number },
>(
  data: T[],
  sortBy: SortBy,
  isLosing: boolean,
): T[] => {
  return [...data].sort((a, b) => {
    switch (sortBy) {
      case "gain":
        return isLosing ? a.gain - b.gain : b.gain - a.gain
      case "percentage":
        return isLosing ? a.percentageChange - b.percentageChange : b.percentageChange - a.percentageChange
      case "original":
        return b.originalValue - a.originalValue
      case "tariff":
        return b.tariffValue - a.tariffValue
      default:
        return 0
    }
  })
}

const getFilteredProducts = <T extends { gain: number; percentageChange: number }>(
  data: T[],
  isLosing: boolean,
): T[] => {
  return data.filter((item) => {
    // Remove items with zero gain or zero percentage change
    return item.gain !== 0 && item.percentageChange !== 0
  })
}

const TableHeaderWithDownload = ({
  title,
  icon,
  isLosing,
  onDownload,
}: {
  title: string
  icon: React.ReactNode
  isLosing: boolean
  onDownload: () => void
}) => {
  const colorClass = getColorClass(isLosing)

  return (
    <CardHeader>
      <div className="flex items-center justify-between">
        <CardTitle className={`flex items-center gap-2 ${colorClass}`}>
          {icon}
          {title}
        </CardTitle>
        <Button variant="outline" size="sm" onClick={onDownload} className="flex items-center gap-2 bg-transparent">
          <Download className="h-4 w-4" />
          CSV
        </Button>
      </div>
    </CardHeader>
  )
}

const AutocompleteInput = React.memo(
  ({
    value,
    onChange,
    onSelect,
    suggestions,
    placeholder,
    disabled,
    searchType,
  }: {
    value: string
    onChange: (value: string) => void
    onSelect: (value: string) => void
    suggestions: any[]
    placeholder: string
    disabled?: boolean
    searchType: "country" | "product"
  }) => {
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [focusTime, setFocusTime] = useState<number | null>(null)
    const [hasTypedAfterFocus, setHasTypedAfterFocus] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const abortControllerRef = useRef<AbortController | null>(null)

    const memoizedSuggestions = useMemo(() => {
      return suggestions.slice(0, 5)
    }, [
      suggestions.length,
      suggestions
        .slice(0, 5)
        .map((s) => (typeof s === "string" ? s : s?.value || s?.name))
        .join(","),
    ])

    const handleFocus = useCallback(() => {
      const currentTime = performance.now()
      setFocusTime(currentTime)
      setHasTypedAfterFocus(false)
      console.log("[v0] Input focused at:", currentTime, "value length:", value.length)
    }, [value.length])

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value
        const changeStartTime = performance.now()

        if (focusTime && !hasTypedAfterFocus) {
          const lag = changeStartTime - focusTime
          console.log("[v0] Focus-to-first-keystroke lag:", lag, "ms")
          setHasTypedAfterFocus(true)
        }

        console.log("[v0] Input change started for:", newValue)
        onChange(newValue)
        setShowSuggestions(newValue.length >= 2)

        const changeEndTime = performance.now()
        console.log("[v0] Input change completed in:", changeEndTime - changeStartTime, "ms")
      },
      [onChange, focusTime, hasTypedAfterFocus],
    )

    const handleSuggestionClick = useCallback(
      (suggestion: any) => {
        const clickStartTime = performance.now()
        console.log("[v0] Suggestion clicked:", suggestion)

        onSelect(suggestion)
        setShowSuggestions(false)
        setFocusTime(null)
        setHasTypedAfterFocus(false)

        const clickEndTime = performance.now()
        console.log("[v0] Suggestion click handling completed in:", clickEndTime - clickStartTime, "ms")
      },
      [onSelect],
    )

    const handleBlur = useCallback(() => {
      console.log("[v0] Input blur - hiding suggestions")
      setTimeout(() => setShowSuggestions(false), 150)
    }, [])

    const shouldShowDropdown = showSuggestions && memoizedSuggestions.length > 0
    console.log("[v0] Dropdown should show:", shouldShowDropdown, "suggestions count:", memoizedSuggestions.length)

    if (shouldShowDropdown) {
      const renderStartTime = performance.now()
      console.log("[v0] Starting dropdown render for:", value, "with", memoizedSuggestions.length, "suggestions")

      setTimeout(() => {
        const renderEndTime = performance.now()
        console.log("[v0] Dropdown render completed in:", renderEndTime - renderStartTime, "ms")
      }, 0)
    }

    return (
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full"
        />
        {shouldShowDropdown && (
          <div className="absolute top-full left-0 right-0 bg-popover border rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
            {memoizedSuggestions.map((suggestion, index) => {
              const suggestionValue = typeof suggestion === "string" ? suggestion : suggestion.value || suggestion.name
              console.log(
                "[v0] Rendering suggestion",
                index,
                ":",
                suggestionValue,
                "type:",
                typeof suggestionValue,
                "suggestion object:",
                suggestion,
              )
              return (
                <button
                  key={index}
                  className="w-full px-3 py-2 text-left hover:bg-muted transition-colors text-sm border-0 bg-transparent text-foreground"
                  onClick={() => handleSuggestionClick(suggestion)}
                  type="button"
                >
                  {suggestionValue}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  },
)

const ProductTable = ({
  title,
  icon,
  data,
  sortBy,
  onSortChange,
  isLosing = false,
  country,
}: {
  title: string
  icon: React.ReactNode
  data: CountryAnalysis[]
  sortBy: SortBy
  onSortChange: (sortBy: SortBy) => void
  isLosing?: boolean
  country?: string
}) => {
  const colorClass = getColorClass(isLosing)
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set())
  const [isTableExpanded, setIsTableExpanded] = useState(false)

  const sortedData = createSortedData(data, sortBy, isLosing)

  const truncateDescription = (text: string, maxLength = 9) => {
    if (!text) return ""
    const cleanText = text.trim()
    return cleanText.length > maxLength ? cleanText.slice(0, maxLength) + "..." : cleanText
  }

  const toggleExpanded = (index: number) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedItems(newExpanded)
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div
          className="flex items-center justify-between cursor-pointer hover:bg-muted/50 -m-2 p-2 rounded-md transition-colors"
          onClick={() => setIsTableExpanded(!isTableExpanded)}
        >
          <div className="flex items-center space-x-2">
            {icon}
            <CardTitle className="text-lg font-semibold">{title}</CardTitle>
          </div>
          <div className="text-muted-foreground">{isTableExpanded ? "▼" : "▶"}</div>
        </div>
      </CardHeader>
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          isTableExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <CardContent className="pt-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHeader
                    label="Product"
                    sortKey="gain"
                    currentSort={sortBy}
                    onSortChange={onSortChange}
                    className="w-1/3"
                  />
                  <SortableTableHeader
                    label="2024 Value"
                    sortKey="original"
                    currentSort={sortBy}
                    onSortChange={onSortChange}
                    align="right"
                    className="w-1/5"
                  />
                  <SortableTableHeader
                    label="With Tariffs"
                    sortKey="tariff"
                    currentSort={sortBy}
                    onSortChange={onSortChange}
                    align="right"
                    className="w-1/5"
                  />
                  <SortableTableHeader
                    label={isLosing ? "Loss" : "Gain"}
                    sortKey="gain"
                    currentSort={sortBy}
                    onSortChange={onSortChange}
                    align="right"
                    className="w-1/5"
                  />
                  <SortableTableHeader
                    label="Change %"
                    sortKey="percentage"
                    currentSort={sortBy}
                    onSortChange={onSortChange}
                    align="right"
                    className="w-1/5"
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.slice(0, 10).map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="align-top">
                      <div className="font-mono text-[10px] font-medium">{item.htsNumber}</div>
                      <div
                        className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none"
                        onClick={() => toggleExpanded(index)}
                      >
                        {expandedItems.has(index) ? item.description : truncateDescription(item.description)}
                        {item.description.length > 9 && (
                          <span className="ml-1 text-blue-500 text-[10px]">{expandedItems.has(index) ? "▼" : "▶"}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right align-top font-sans text-sm">
                      {formatCurrency(item.originalValue)}
                    </TableCell>
                    <TableCell className="text-right align-top font-sans text-sm">
                      {formatCurrency(item.tariffValue)}
                    </TableCell>
                    <TableCell className={`text-right align-top font-sans font-semibold text-sm ${colorClass}`}>
                      {formatCurrency(item.gain)}
                    </TableCell>
                    <TableCell className={`text-right align-top font-sans text-sm ${colorClass}`}>
                      {item.percentageChange.toFixed(2)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </div>
    </Card>
  )
}

const CountryTable = ({
  title,
  icon,
  data,
  sortBy,
  onSortChange,
  isLosing = false,
}: {
  title: string
  icon: React.ReactNode
  data: ProductAnalysis[]
  sortBy: SortBy
  onSortChange: (sortBy: SortBy) => void
  isLosing?: boolean
}) => {
  const sortedData = useMemo(() => {
    if (sortBy === "percentage") {
      return createSortedData(data, sortBy, isLosing)
    }
    return data
  }, [data, sortBy, isLosing])

  const colorClass = getColorClass(isLosing)

  const handleDownload = createCSVDownloadHandler(
    () =>
      sortedData.map((item) => ({
        Country: item.country,
        "2024 Value": formatCurrency(item.originalValue),
        "With Tariffs": formatCurrency(item.tariffValue),
        [`${isLosing ? "Loss" : "Gain"}`]: formatCurrency(item.gain),
        "Percentage Change": item.percentageChange.toFixed(2) + "%",
      })),
    () => generateFilename(title),
    () => ["Country", "2024 Value", "With Tariffs", `${isLosing ? "Loss" : "Gain"}`, "Percentage Change"],
    () => title, // Use the table title as query description
  )

  return (
    <Card>
      <TableHeaderWithDownload title={title} icon={icon} isLosing={isLosing} onDownload={handleDownload} />
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Country</TableHead>
              <TableHead className="text-right font-sans">2024 Value</TableHead>
              <TableHead className="text-right font-sans">With Tariffs</TableHead>
              <SortableTableHeader
                label={isLosing ? "Loss" : "Gain"}
                sortKey="gain"
                currentSort={sortBy}
                onSortChange={onSortChange}
                align="right"
              />
              <SortableTableHeader
                label="% Change"
                sortKey="percentage"
                currentSort={sortBy}
                onSortChange={onSortChange}
                align="right"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((item, index) => (
              <TableRow key={index} className={index % 2 === 1 ? "bg-gray-100" : ""}>
                <TableCell className="font-medium">{item.country}</TableCell>
                <TableCell className="text-right font-sans">{formatCurrency(item.originalValue)}</TableCell>
                <TableCell className="text-right font-sans">{formatCurrency(item.tariffValue)}</TableCell>
                <TableCell className={`text-right font-medium font-sans ${colorClass}`}>
                  {formatCurrency(Math.abs(item.gain))}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary" className={colorClass}>
                    {formatPercentage(item.percentageChange)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000000) {
    const billions = value / 1000000000
    return (
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 1,
        maximumFractionDigits: 3,
      }).format(billions) + "B"
    )
  } else if (Math.abs(value) >= 1000000) {
    const millions = value / 1000000
    return (
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 1,
        maximumFractionDigits: 3,
      }).format(millions) + "M"
    )
  } else {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }
}

const formatPercentage = (value: number) => {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`
}

const useDebouncedSearch = (searchIndex: any[], searchType: "country" | "product", delay = 150) => {
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const searchCache = useRef(new Map<string, any[]>())
  const abortControllerRef = useRef<AbortController | null>(null)

  // Debounce the search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, delay)

    return () => clearTimeout(timer)
  }, [search, delay])

  const filteredItems = useMemo(() => {
    if (debouncedSearch.length < 2) return []

    // Cancel previous search if still running
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    // Check cache first
    const cacheKey = `${searchType}-${debouncedSearch}`
    if (searchCache.current.has(cacheKey)) {
      return searchCache.current.get(cacheKey)
    }

    const searchLower = debouncedSearch.toLowerCase()
    let results: any[] = []

    try {
      if (searchType === "country") {
        // Binary search for country prefix matches, then linear for contains
        const prefixMatches = searchIndex.filter((item) => item.normalized.startsWith(searchLower))
        const containsMatches = searchIndex.filter(
          (item) => !item.normalized.startsWith(searchLower) && item.normalized.includes(searchLower),
        )
        results = [...prefixMatches, ...containsMatches].map((item) => item.original).slice(0, 5)
      } else {
        // Product search with HTS number priority
        const htsMatches = searchIndex.filter((item) => item.normalizedHts.includes(debouncedSearch))
        const descMatches = searchIndex.filter(
          (item) => !item.normalizedHts.includes(debouncedSearch) && item.normalizedDesc.includes(searchLower),
        )
        results = [...htsMatches, ...descMatches].map((item) => item.original).slice(0, 5)
      }

      // Cache the results
      searchCache.current.set(cacheKey, results)

      // Limit cache size to prevent memory leaks
      if (searchCache.current.size > 50) {
        const firstKey = searchCache.current.keys().next().value
        searchCache.current.delete(firstKey)
      }

      return results
    } catch (error) {
      if (error.name === "AbortError") {
        return []
      }
      throw error
    }
  }, [searchIndex, debouncedSearch, searchType])

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
  }, [])

  return { search, filteredItems, handleSearchChange }
}

interface AutocompleteInputProps {
  suggestions: any[]
  placeholder: string
  value: string
  onChange: (value: string) => void
  onSelect: (item: any) => void
  disabled?: boolean
  renderSuggestion?: (item: any) => React.ReactNode
}

const usePrecomputedSearchIndices = (countries: string[], products: any[]) => {
  return useMemo(() => {
    const countryIndex = countries
      .map((country, index) => ({
        original: country,
        normalized: country.toLowerCase(),
        index,
      }))
      .sort((a, b) => a.normalized.localeCompare(b.normalized))

    const productIndex = products.map((product, index) => ({
      original: product,
      normalizedHts: product.htsNumber,
      normalizedDesc: product.description.toLowerCase(),
      searchText: `${product.htsNumber} ${product.description.toLowerCase()}`,
      index,
    }))

    return { countryIndex, productIndex }
  }, [countries, products])
}

const useOptimizedSearchWithCache = (searchIndex: any[], searchType: "country" | "product") => {
  const [search, setSearch] = useState("")
  const searchCache = useRef(new Map<string, any[]>())

  const filteredItems = useMemo(() => {
    if (search.length < 2) return []

    // Check cache first
    const cacheKey = `${searchType}-${search}`
    if (searchCache.current.has(cacheKey)) {
      return searchCache.current.get(cacheKey)
    }

    const searchLower = search.toLowerCase()
    let results: any[] = []

    try {
      if (searchType === "country") {
        // Binary search for country prefix matches, then linear for contains
        const prefixMatches = searchIndex.filter((item) => item.normalized.startsWith(searchLower))
        const containsMatches = searchIndex.filter(
          (item) => !item.normalized.startsWith(searchLower) && item.normalized.includes(searchLower),
        )
        results = [...prefixMatches, ...containsMatches].map((item) => item.original).slice(0, 5)
      } else {
        // Product search with HTS number priority
        const htsMatches = searchIndex.filter((item) => item.normalizedHts.includes(search))
        const descMatches = searchIndex.filter(
          (item) => !item.normalizedHts.includes(search) && item.normalizedDesc.includes(searchLower),
        )
        results = [...htsMatches, ...descMatches].map((item) => item.original).slice(0, 5)
      }

      // Cache the results
      searchCache.current.set(cacheKey, results)

      // Limit cache size to prevent memory leaks
      if (searchCache.current.size > 50) {
        const firstKey = searchCache.current.keys().next().value
        searchCache.current.delete(firstKey)
      }

      return results
    } catch (error) {
      if (error.name === "AbortError") {
        return []
      }
      throw error
    }
  }, [searchIndex, search, searchType])

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
  }, [])

  const clearSearch = useCallback(() => {
    setSearch("")
  }, [])

  return {
    search,
    filteredItems,
    handleSearchChange,
    clearSearch,
  }
}

const useSimpleProductSearch = (products: any[]) => {
  const [search, setSearch] = useState("")

  const filteredItems = useMemo(() => {
    if (search.length < 1) return []

    const searchLower = search.toLowerCase()
    const results: any[] = []

    for (const product of products) {
      if (results.length >= 5) break

      // Simple search: check if HTS number or description contains the search term
      if (product.htsNumber.includes(search) || product.description.toLowerCase().includes(searchLower)) {
        results.push(product)
      }
    }

    return results
  }, [search, products])

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
  }, [])

  return { search, filteredItems, handleSearchChange }
}

const COUNTRIES = [
  "Afghanistan",
  "Albania",
  "Algeria",
  "Andorra",
  "Angola",
  "Anguilla",
  "Antigua and Barbuda",
  "Argentina",
  "Armenia",
  "Aruba",
  "Australia",
  "Austria",
  "Azerbaijan",
  "Bahamas",
  "Bahrain",
  "Bangladesh",
  "Barbados",
  "Belarus",
  "Belgium",
  "Belize",
  "Benin",
  "Bermuda",
  "Bhutan",
  "Bolivia",
  "Bosnia and Herzegovina",
  "Botswana",
  "Brazil",
  "British Indian Ocean Territory",
  "British Virgin Islands",
  "Brunei",
  "Bulgaria",
  "Burkina Faso",
  "Burundi",
  "Cabo Verde",
  "Cambodia",
  "Cameroon",
  "Canada",
  "Cayman Islands",
  "Central African Republic",
  "Chad",
  "Chile",
  "China",
  "Christmas Island",
  "Cocos (Keeling) Islands",
  "Colombia",
  "Comoros",
  "Cook Islands",
  "Costa Rica",
  "Croatia",
  "Cuba",
  "Curaçao",
  "Cyprus",
  "Czechia (Czech Republic)",
  "Côte d`Ivoire",
  "Democratic Republic of the Congo",
  "Denmark",
  "Djibouti",
  "Dominica",
  "Dominican Republic",
  "Ecuador",
  "Egypt",
  "El Salvador",
  "Equatorial Guinea",
  "Eritrea",
  "Estonia",
  "Eswatini (Swaziland)",
  "Ethiopia",
  "Falkland Islands",
  "Faroe Islands",
  "Fiji",
  "Finland",
  "France",
  "French Guiana",
  "French Polynesia",
  "French Southern and Antarctic Lands",
  "Gabon",
  "Gambia",
  "Gaza Strip",
  "Georgia",
  "Germany",
  "Ghana",
  "Gibraltar",
  "Greece",
  "Greenland",
  "Grenada",
  "Guadeloupe",
  "Guatemala",
  "Guinea",
  "Guinea-Bissau",
  "Guyana",
  "Haiti",
  "Heard and McDonald Islands",
  "Honduras",
  "Hong Kong",
  "Hungary",
  "Iceland",
  "India",
  "Indonesia",
  "Iran",
  "Iraq",
  "Ireland",
  "Israel",
  "Italy",
  "Jamaica",
  "Japan",
  "Jordan",
  "Kazakhstan",
  "Kenya",
  "Kiribati",
  "Kosovo",
  "Kuwait",
  "Kyrgyzstan",
  "Laos",
  "Latvia",
  "Lebanon",
  "Lesotho",
  "Liberia",
  "Libya",
  "Liechtenstein",
  "Lithuania",
  "Luxembourg",
  "Macau",
  "Madagascar",
  "Malawi",
  "Malaysia",
  "Maldives",
  "Mali",
  "Malta",
  "Marshall Islands",
  "Martinique",
  "Mauritania",
  "Mauritius",
  "Mayotte",
  "Mexico",
  "Micronesia",
  "Moldova",
  "Monaco",
  "Mongolia",
  "Montenegro",
  "Montserrat",
  "Morocco",
  "Mozambique",
  "Myanmar (Burma)",
  "Namibia",
  "Nauru",
  "Nepal",
  "Netherlands",
  "New Caledonia",
  "New Zealand",
  "Nicaragua",
  "Niger",
  "Nigeria",
  "Niue",
  "Norfolk Island",
  "North Korea",
  "North Macedonia",
  "Norway",
  "Oman",
  "Pakistan",
  "Palau",
  "Panama",
  "Papua New Guinea",
  "Paraguay",
  "Peru",
  "Philippines",
  "Pitcairn Islands",
  "Poland",
  "Portugal",
  "Qatar",
  "Republic of the Congo",
  "Reunion",
  "Romania",
  "Russia",
  "Rwanda",
  "Saint Helena",
  "Saint Kitts and Nevis",
  "Saint Lucia",
  "Saint Pierre and Miquelon",
  "Saint Vincent and the Grenadines",
  "Samoa",
  "San Marino",
  "Saudi Arabia",
  "Senegal",
  "Serbia",
  "Seychelles",
  "Sierra Leone",
  "Singapore",
  "Sint Maarten",
  "Slovakia",
  "Slovenia",
  "Solomon Islands",
  "Somalia",
  "South Africa",
  "South Korea",
  "South Sudan",
  "Spain",
  "Sri Lanka",
  "Sudan",
  "Suriname",
  "Svalbard and Jan Mayen",
  "Sweden",
  "Switzerland",
  "Syria",
  "São Tomé and Príncipe",
  "Taiwan",
  "Tajikistan",
  "Tanzania",
  "Thailand",
  "Timor-Leste",
  "Togo",
  "Tokelau",
  "Tonga",
  "Trinidad and Tobago",
  "Tunisia",
  "Turkey",
  "Turkmenistan",
  "Turks and Caicos Islands",
  "Tuvalu",
  "Uganda",
  "Ukraine",
  "United Arab Emirates",
  "United Kingdom",
  "Uruguay",
  "Uzbekistan",
  "Vanuatu",
  "Vatican City",
  "Venezuela",
  "Vietnam",
  "Wallis and Futuna",
  "West Bank",
  "Western Sahara",
  "Yemen",
  "Zambia",
  "Zimbabwe",
]

const useInstantCountrySearch = () => {
  const [search, setSearch] = useState("")

  const filteredItems = useMemo(() => {
    if (search.length < 1) return []

    const searchLower = search.toLowerCase()
    const prefixMatches = COUNTRIES.filter((country) => country.toLowerCase().startsWith(searchLower))
    const containsMatches = COUNTRIES.filter(
      (country) => !country.toLowerCase().startsWith(searchLower) && country.toLowerCase().includes(searchLower),
    )

    return [...prefixMatches, ...containsMatches].slice(0, 5)
  }, [search])

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
  }, [])

  return { search, filteredItems, handleSearchChange }
}

export default function TariffAnalysisTool() {
  const [selectedCountry, setSelectedCountry] = useState("")
  const [selectedCountries, setSelectedCountries] = useState<string[]>([])
  const [selectedProduct, setSelectedProduct] = useState<string>("")
  const [originalData, setOriginalData] = useState<TradeData[]>([])
  const [tariffData, setTariffData] = useState<TradeData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const gainingSort = useTableSort("gain")
  const losingSort = useTableSort("gain")
  const productWinnersSort = useTableSort("gain")
  const productLosersSort = useTableSort("gain")

  const countries = useMemo(() => {
    if (originalData.length === 0) return []
    const countryColumns = Object.keys(originalData[0]).filter((key) => key !== "HTS Number" && key !== "Description")
    return countryColumns.sort()
  }, [originalData])

  const products = useMemo(() => {
    return originalData.map((row) => {
      const htsNumber = String(row["HTS Number"]).padStart(6, "0")
      const description = row["Description"]
      return {
        value: `${htsNumber} - ${description}`,
        htsNumber,
        description,
      }
    })
  }, [originalData])

  const { countryIndex, productIndex } = usePrecomputedSearchIndices(countries, products)

  const countryTabSearchHook = useInstantCountrySearch()
  const compareTabSearchHook = useInstantCountrySearch()
  const productTabSearchHook = useSimpleProductSearch(products)

  const getCountryFlag = (countryName: string): string => {
    const countryFlags: { [key: string]: string } = {
      Afghanistan: "af",
      Albania: "al",
      Algeria: "dz",
      Argentina: "ar",
      Armenia: "am",
      Australia: "au",
      Austria: "at",
      Azerbaijan: "az",
      Bahrain: "bh",
      Bangladesh: "bd",
      Belarus: "by",
      Belgium: "be",
      Bolivia: "bo",
      Brazil: "br",
      Bulgaria: "bg",
      Cambodia: "kh",
      Canada: "ca",
      Chile: "cl",
      China: "cn",
      Colombia: "co",
      Croatia: "hr",
      "Czech Republic": "cz",
      Denmark: "dk",
      Ecuador: "ec",
      Egypt: "eg",
      Estonia: "ee",
      Finland: "fi",
      France: "fr",
      Georgia: "ge",
      Germany: "de",
      Greece: "gr",
      Guatemala: "gt",
      Honduras: "hn",
      "Hong Kong": "hk",
      Hungary: "hu",
      Iceland: "is",
      India: "in",
      Indonesia: "id",
      Iran: "ir",
      Iraq: "iq",
      Ireland: "ie",
      Israel: "il",
      Italy: "it",
      Japan: "jp",
      Jordan: "jo",
      Kazakhstan: "kz",
      Kenya: "ke",
      Kuwait: "kw",
      Latvia: "lv",
      Lebanon: "lb",
      Lithuania: "lt",
      Luxembourg: "lu",
      Malaysia: "my",
      Mexico: "mx",
      Morocco: "ma",
      Netherlands: "nl",
      "New Zealand": "nz",
      Norway: "no",
      Oman: "om",
      Pakistan: "pk",
      Peru: "pe",
      Philippines: "ph",
      Poland: "pl",
      Portugal: "pt",
      Qatar: "qa",
      Romania: "ro",
      Russia: "ru",
      "Saudi Arabia": "sa",
      Singapore: "sg",
      Slovakia: "sk",
      Slovenia: "si",
      "South Africa": "za",
      "South Korea": "kr",
      Spain: "es",
      "Sri Lanka": "lk",
      Sweden: "se",
      Switzerland: "ch",
      Taiwan: "tw",
      Thailand: "th",
      Turkey: "tr",
      Ukraine: "ua",
      "United Arab Emirates": "ae",
      "United Kingdom": "gb",
      "United States": "us",
      Uruguay: "uy",
      Venezuela: "ve",
      Vietnam: "vn",
    }

    return countryFlags[countryName] || "world"
  }

  // Load CSV data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)

        // Load original data
        const originalResponse = await fetch(CSV_URLS.ORIGINAL_2024)
        const originalText = await originalResponse.text()
        const originalParsed = parseCSV(originalText)
        setOriginalData(originalParsed)

        // Load the actual tariff data instead of using original data as placeholder
        const tariffResponse = await fetch(CSV_URLS.WITH_TARIFFS)
        const tariffText = await tariffResponse.text()
        const tariffParsed = parseCSV(tariffText)
        setTariffData(tariffParsed)
      } catch (err) {
        setError("Failed to load data. Please check the CSV URLs.")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const parseCSV = (text: string): TradeData[] => {
    const lines = text.trim().split("\n")
    const headers = parseCSVLine(lines[0])

    return lines.slice(1).map((line) => {
      const values = parseCSVLine(line)
      const row: TradeData = {} as TradeData
      headers.forEach((header, index) => {
        if (header === "HTS Number") {
          // Pad with leading zeros to ensure 6-digit format
          const htsValue = values[index] || "000000"
          row[header] = htsValue.padStart(6, "0")
        } else {
          row[header] = values[index] || "0"
        }
      })
      return row
    })
  }

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = []
    let current = ""
    let inQuotes = false
    let i = 0

    while (i < line.length) {
      const char = line[i]

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Handle escaped quotes ("")
          current += '"'
          i += 2
        } else {
          // Toggle quote state
          inQuotes = !inQuotes
          i++
        }
      } else if (char === "," && !inQuotes) {
        // Field separator outside of quotes
        result.push(current.trim())
        current = ""
        i++
      } else {
        current += char
        i++
      }
    }

    // Add the last field
    result.push(current.trim())

    return result
  }

  const safeParseFloat = (value: string | undefined): number => {
    if (!value || value === "" || value === "undefined" || value === "null") {
      return 0
    }
    // Remove any commas, spaces, and other non-numeric characters except decimal points and minus signs
    const cleanValue = value.replace(/[^\d.-]/g, "")
    const parsed = Number.parseFloat(cleanValue)
    return Number.isNaN(parsed) ? 0 : parsed
  }

  // Country Analysis Logic
  const analyzeCountry = (country: string): CountryAnalysis[] => {
    const analysis: CountryAnalysis[] = []

    originalData.forEach((originalRow) => {
      const htsNumber = String(originalRow["HTS Number"]).padStart(6, "0")
      const tariffRow = tariffData.find((row) => String(row["HTS Number"]).padStart(6, "0") === htsNumber)
      if (!tariffRow) return

      const originalValue = safeParseFloat(originalRow[country])
      const tariffValue = safeParseFloat(tariffRow[country])
      const gain = tariffValue - originalValue
      const percentageChange = originalValue > 0 ? (gain / originalValue) * 100 : 0

      analysis.push({
        product: `${htsNumber} - ${originalRow["Description"]}`,
        htsNumber, // Use the padded HTS number
        description: originalRow["Description"], // Full HTS-6 description
        originalValue,
        tariffValue,
        gain,
        percentageChange,
      })
    })

    return analysis.sort((a, b) => b.gain - a.gain)
  }

  const compareCountries = (countries: string[]): CountryComparison[] => {
    return countries.map((country) => {
      let originalTotal = 0
      let tariffTotal = 0
      let validRowCount = 0

      originalData.forEach((originalRow) => {
        const htsNumber = String(originalRow["HTS Number"]).padStart(6, "0")
        const tariffRow = tariffData.find((row) => String(row["HTS Number"]).padStart(6, "0") === htsNumber)
        if (!tariffRow) return

        const originalValue = safeParseFloat(originalRow[country])
        const tariffValue = safeParseFloat(tariffRow[country])

        // Only count rows where we have valid data
        if (originalValue > 0 || tariffValue > 0) {
          validRowCount++
        }

        originalTotal += originalValue
        tariffTotal += tariffValue
      })

      const totalGain = tariffTotal - originalTotal
      const percentageGain = originalTotal > 0 ? (totalGain / originalTotal) * 100 : 0

      return {
        country,
        originalImports: originalTotal,
        tariffImports: tariffTotal,
        totalGain,
        percentageGain,
      }
    })
  }

  // Product Analysis Logic
  const analyzeProduct = (productValue: string): ProductAnalysis[] => {
    const [htsNumber] = productValue.split(" - ")
    const paddedHtsNumber = htsNumber.padStart(6, "0")
    const productRow = originalData.find((row) => String(row["HTS Number"]).padStart(6, "0") === paddedHtsNumber)
    const tariffRow = tariffData.find((row) => String(row["HTS Number"]).padStart(6, "0") === paddedHtsNumber)

    if (!productRow || !tariffRow) return []

    const analysis: ProductAnalysis[] = []

    countries.forEach((country) => {
      const originalValue = safeParseFloat(productRow[country])
      const tariffValue = safeParseFloat(tariffRow[country])
      const gain = tariffValue - originalValue
      const percentageChange = originalValue > 0 ? (gain / originalValue) * 100 : 0

      if (originalValue > 0 || tariffValue > 0) {
        analysis.push({
          country,
          htsNumber: paddedHtsNumber, // Use the padded HTS number
          description: productRow["Description"],
          originalValue,
          tariffValue,
          gain,
          percentageChange,
        })
      }
    })

    return analysis.sort((a, b) => b.gain - a.gain)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading trade data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Data</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto py-8 px-6 max-w-none">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2 text-center">
            Competitiveness Effect of US Tariffs on Countries and Products
          </h1>
          <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
            <div className="flex-shrink-0">
              <a
                href="https://csep.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-80 transition-opacity"
              >
                <img
                  src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/CSEP%20Logo-xgawbTegrnDshGbHRafUjMIoo8doyo.png"
                  alt="CSEP Logo"
                  className="h-12 w-auto"
                />
              </a>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center text-center">
              <span>
                Author: <strong>Srinivasan Thirumalai</strong>
                <sup>1</sup>
              </span>
              <span className="hidden sm:inline">•</span>
              <span>
                Web Developer: <strong>Sarvesh Ramprakash</strong>
                <sup>2</sup>
              </span>
            </div>
            <div className="flex-shrink-0">
              <a
                href="https://www.tradesentinel.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-80 transition-opacity"
              >
                <img
                  src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Trade%20Sentinel%20logo%20%28transparent%29-cgtSmwX8WEei49x7ZVpbKTc4M0FCKX.png"
                  alt="TradeSentinel Logo"
                  className="w-32 h-32"
                />
              </a>
            </div>
          </div>
        </div>

        <Tabs defaultValue="country" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger
              value="country"
              className="flex items-center gap-2 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800 data-[state=active]:border-blue-300 hover:bg-blue-50"
            >
              <Search className="h-4 w-4" />
              <span className="text-center leading-tight">
                Analyze by
                <br className="sm:hidden" /> Country
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="compare"
              className="flex items-center gap-2 data-[state=active]:bg-green-100 data-[state=active]:text-green-800 data-[state=active]:border-green-300 hover:bg-green-50"
            >
              <Users className="h-4 w-4" />
              <span className="text-center leading-tight">
                Compare
                <br className="sm:hidden" /> Countries
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="product"
              className="flex items-center gap-2 data-[state=active]:bg-orange-100 data-[state=active]:text-orange-800 data-[state=active]:border-orange-300 hover:bg-orange-50"
            >
              <Package className="h-4 w-4" />
              <span className="text-center leading-tight">
                Analyze a<br className="sm:hidden" /> Product
              </span>
            </TabsTrigger>
          </TabsList>

          {/* Analyze by Country Tab */}
          <TabsContent value="country" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Country Analysis</CardTitle>
                <CardDescription>
                  Select a country to see the top gaining and losing products from tariff implementation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <AutocompleteInput
                    placeholder="Search for a country..."
                    value={countryTabSearchHook.search}
                    onChange={countryTabSearchHook.handleSearchChange}
                    suggestions={countryTabSearchHook.filteredItems}
                    onSelect={(country) => {
                      setSelectedCountry(country)
                      countryTabSearchHook.handleSearchChange("")
                    }}
                    searchType="country"
                  />
                </div>

                {selectedCountry && (
                  <div className="text-center mb-6">
                    <div className="inline-block px-4 py-2 bg-muted rounded-lg">
                      <span className="text-lg font-semibold text-foreground flex items-center justify-center gap-2">
                        {selectedCountry}
                        {getCountryFlag(selectedCountry) !== "world" && (
                          <img
                            src={`https://flagcdn.com/24x18/${getCountryFlag(selectedCountry)}.png`}
                            alt={`${selectedCountry} flag`}
                            className="inline-block"
                            width={24}
                            height={18}
                          />
                        )}
                      </span>
                    </div>
                  </div>
                )}

                {selectedCountry && (
                  <div className="space-y-6">
                    {(() => {
                      const analysis = analyzeCountry(selectedCountry)
                      const filteredGainers = getFilteredProducts(
                        analysis.filter((item) => item.gain > 0),
                        false,
                      )
                      const filteredLosers = getFilteredProducts(
                        analysis.filter((item) => item.gain < 0),
                        true,
                      )

                      const topGains = filteredGainers.slice(0, 10)
                      const topLosses = filteredLosers.slice(-10).reverse()
                      const totalOriginal = analysis.reduce((sum, item) => sum + item.originalValue, 0)
                      const totalTariff = analysis.reduce((sum, item) => sum + item.tariffValue, 0)
                      const totalGains = filteredGainers.reduce((sum, item) => sum + item.gain, 0)
                      const totalLosses = filteredLosers.reduce((sum, item) => sum + item.gain, 0)

                      return (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                            <Card>
                              <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Imports 2024</CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="text-lg font-bold flex items-center">
                                  {formatCurrency(totalOriginal)}
                                </div>
                              </CardContent>
                            </Card>
                            <Card>
                              <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">After Tariff</CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="text-lg font-bold flex items-center">{formatCurrency(totalTariff)}</div>
                              </CardContent>
                            </Card>
                            <Card>
                              <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Total Gains</CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="text-lg font-bold text-green-600 flex items-center">
                                  {formatCurrency(totalGains)}
                                </div>
                              </CardContent>
                            </Card>
                            <Card>
                              <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Total Losses</CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="text-lg font-bold text-red-600 flex items-center">
                                  {formatCurrency(Math.abs(totalLosses))}
                                </div>
                              </CardContent>
                            </Card>
                            <Card>
                              <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Net Impact</CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="text-lg font-bold flex items-center gap-2">
                                  {formatCurrency(totalGains + totalLosses)}
                                  {totalGains + totalLosses > 0 ? (
                                    <TrendingUp className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <TrendingDown className="h-4 w-4 text-red-500" />
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <ProductTable
                              title="Top 10 Gaining Products"
                              icon={<TrendingUp className="h-5 w-5" />}
                              data={topGains}
                              sortBy={gainingSort.sortBy}
                              onSortChange={gainingSort.setSortBy}
                              country={selectedCountry} // Include country prop
                            />
                            <ProductTable
                              title="Top 10 Losing Products"
                              icon={<TrendingDown className="h-5 w-5" />}
                              data={topLosses}
                              sortBy={losingSort.sortBy}
                              onSortChange={losingSort.setSortBy}
                              isLosing={true}
                              country={selectedCountry} // Include country prop
                            />
                          </div>
                        </>
                      )
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Compare Countries Tab */}
          <TabsContent value="compare" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Country Comparison</CardTitle>
                <CardDescription>
                  Compare up to 10 countries to see their relative gains and losses from tariff implementation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {selectedCountries.map((country) => (
                      <Badge key={country} variant="secondary" className="flex items-center gap-2">
                        {getCountryFlag(country) !== "world" && (
                          <img
                            src={`https://flagcdn.com/16x12/${getCountryFlag(country)}.png`}
                            alt={`${country} flag`}
                            className="inline-block"
                            width={16}
                            height={12}
                          />
                        )}
                        {country}
                        <button
                          onClick={() => setSelectedCountries((prev) => prev.filter((c) => c !== country))}
                          className="ml-1 hover:text-destructive"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>

                  <AutocompleteInput
                    placeholder="Search and add countries... (max 10)"
                    value={compareTabSearchHook.search}
                    onChange={compareTabSearchHook.handleSearchChange}
                    suggestions={compareTabSearchHook.filteredItems.filter(
                      (country) => !selectedCountries.includes(country),
                    )}
                    onSelect={(country) => {
                      setSelectedCountries((prev) => [...prev, country])
                      compareTabSearchHook.handleSearchChange("")
                    }}
                    disabled={selectedCountries.length >= 10}
                    searchType="country"
                  />

                  {selectedCountries.length > 0 && (
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle>Comparison Results</CardTitle>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={createCSVDownloadHandler(
                              () => {
                                const comparisonData = compareCountries(selectedCountries)
                                return comparisonData.map((item) => ({
                                  Country: item.country,
                                  "2024 Imports": formatCurrency(item.originalImports),
                                  "With Tariffs": formatCurrency(item.tariffImports),
                                  "Gain/Loss": formatCurrency(item.totalGain),
                                  "Percentage Change": formatPercentage(item.percentageGain),
                                }))
                              },
                              () => generateFilename("country_comparison"),
                              () => ["Country", "2024 Imports", "With Tariffs", "Gain/Loss", "Percentage Change"],
                              () => "Comparison Results", // Query description for comparison
                            )}
                            className="flex items-center gap-2"
                          >
                            <Download className="h-4 w-4" />
                            CSV
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Country</TableHead>
                              <TableHead className="text-right font-sans">2024 Imports</TableHead>
                              <TableHead className="text-right">With Tariffs</TableHead>
                              <TableHead className="text-right">Gain/Loss</TableHead>
                              <TableHead className="text-right">% Change</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {compareCountries(selectedCountries).map((comparison, index) => (
                              <TableRow key={index} className={index % 2 === 1 ? "bg-gray-100" : ""}>
                                <TableCell className="font-medium">{comparison.country}</TableCell>
                                <TableCell className="text-right font-sans">
                                  {formatCurrency(comparison.originalImports)}
                                </TableCell>
                                <TableCell className="text-right font-sans">
                                  {formatCurrency(comparison.tariffImports)}
                                </TableCell>
                                <TableCell
                                  className={`text-right font-medium ${
                                    comparison.totalGain >= 0 ? "text-green-600" : "text-red-600"
                                  }`}
                                >
                                  {formatCurrency(comparison.totalGain)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Badge
                                    variant="secondary"
                                    className={comparison.percentageGain >= 0 ? "text-green-600" : "text-red-600"}
                                  >
                                    {formatPercentage(comparison.percentageGain)}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analyze a Product Tab */}
          <TabsContent value="product" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Product Analysis</CardTitle>
                <CardDescription>
                  Select a product to see which countries gain or lose from tariff implementation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <AutocompleteInput
                    placeholder="Search for a product..."
                    value={productTabSearchHook.search}
                    onChange={productTabSearchHook.handleSearchChange}
                    suggestions={productTabSearchHook.filteredItems}
                    onSelect={(product) => {
                      console.log("[v0] Product selected:", product)
                      setSelectedProduct(product.value || product)
                      productTabSearchHook.handleSearchChange("")
                    }}
                    renderSuggestion={(product) => (
                      <>
                        <div className="font-semibold">{product.htsNumber}</div>
                        <div className="text-sm text-muted-foreground truncate">{product.description}</div>
                      </>
                    )}
                    searchType="product"
                  />
                </div>

                {selectedProduct && (
                  <div className="text-center mb-6">
                    <div className="inline-block px-4 py-2 bg-muted rounded-lg">
                      <div className="text-lg font-semibold text-foreground">
                        {(() => {
                          const [htsNumber, ...descriptionParts] = selectedProduct.split(" - ")
                          const description = descriptionParts.join(" - ")
                          return (
                            <>
                              <div className="font-bold">{htsNumber}</div>
                              <div className="text-sm text-muted-foreground mt-1">{description}</div>
                            </>
                          )
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {selectedProduct && (
                  <div className="space-y-6">
                    {(() => {
                      const analysis = analyzeProduct(selectedProduct)
                      const filteredWinners = getFilteredProducts(
                        analysis.filter((item) => item.gain > 0),
                        false,
                      )
                      const filteredLosers = getFilteredProducts(
                        analysis.filter((item) => item.gain < 0),
                        true,
                      )

                      const winners = filteredWinners
                        .sort((a, b) => b.gain - a.gain) // Sort by highest gains first
                        .slice(0, 5)
                      const losers = filteredLosers
                        .sort((a, b) => a.gain - b.gain) // Sort by most negative gains first (biggest losses)
                        .slice(0, 5)

                      return (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <CountryTable
                            title="Top 5 Winning Countries"
                            icon={<TrendingUp className="h-5 w-5" />}
                            data={winners}
                            sortBy={productWinnersSort.sortBy}
                            onSortChange={productWinnersSort.setSortBy}
                          />
                          <CountryTable
                            title="Top 5 Losing Countries"
                            icon={<TrendingDown className="h-5 w-5" />}
                            data={losers}
                            sortBy={productLosersSort.sortBy}
                            onSortChange={productLosersSort.setSortBy}
                            isLosing={true}
                          />
                        </div>
                      )
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <footer className="bg-muted/30 py-8 px-6 mt-16">
        <div className="max-w-none mx-auto">
          <div>
            <p className="text-sm text-muted-foreground">Data as of August 7, 2025.</p>
            <p className="text-xs text-muted-foreground">
              <sup>1</sup> Srinivasan Thirumalai: Senior Visiting Fellow,{" "}
              <a
                href="https://csep.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                Centre for Social and Economic Progress
              </a>
              , New Delhi, Co-founder:{" "}
              <a
                href="https://www.tradesentinel.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                TradeSentinel.org
              </a>
            </p>
            <p className="text-xs text-muted-foreground">
              <sup>2</sup> Sarvesh Ramprakash:{" "}
              <a
                href="https://bit.ly/aboutMoi"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                Independent Software Development/Cybersecurity Consultant
              </a>
            </p>
            <div className="mt-4 text-left">
              <p className="text-xs text-muted-foreground">
                For questions and/or comments, please write to:{" "}
                <a href="mailto:sthirumalai@csep.org" className="text-blue-600 hover:text-blue-800 hover:underline">
                  sthirumalai@csep.org
                </a>
              </p>
              <p className="text-xs text-muted-foreground">
                For web UI/UX questions, please write to:{" "}
                <a
                  href="mailto:sarvesh.ramprakash@gmail.com"
                  className="text-blue-600 hover:text-blue-800 hover:underline"
                >
                  sarvesh.ramprakash@gmail.com
                </a>
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
