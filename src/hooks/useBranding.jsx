import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase/client'

const BRANDING_DEFAULTS = {
  branding_app_name: "IELTS Leveling",
  branding_description: "Web làm bài tập, gamification, sự kiện, thi đấu.",
  branding_logo_url: "https://tezpffaiydfmuyuparfw.supabase.co/storage/v1/object/public/ui-assets/image/Logo_Pinta.png",
  branding_favicon_url: "https://tezpffaiydfmuyuparfw.supabase.co/storage/v1/object/public/ui-assets/favicon.ico",
  branding_og_image_url: "https://tezpffaiydfmuyuparfw.supabase.co/storage/v1/object/public/ui-assets/Asset%205.png",
  branding_base_asset_url: "https://tezpffaiydfmuyuparfw.supabase.co/storage/v1/object/public/ui-assets",
  branding_base_site_url: "https://xpclass.vn",
  branding_hero_image_url: "https://tezpffaiydfmuyuparfw.supabase.co/storage/v1/object/public/ui-assets/image/dashboard/blue_dashboard_hero_section.jpeg",
}

// Module-level state so assetUrl/siteUrl work outside React components
let _baseAssetUrl = BRANDING_DEFAULTS.branding_base_asset_url
let _baseSiteUrl = BRANDING_DEFAULTS.branding_base_site_url

export const assetUrl = (path) => _baseAssetUrl + path
export const siteUrl = (path) => _baseSiteUrl + path

const BrandingContext = createContext({})

export const useBranding = () => {
  const context = useContext(BrandingContext)
  if (!context) {
    throw new Error('useBranding must be used within a BrandingProvider')
  }
  return context
}

export const BrandingProvider = ({ children }) => {
  const [settings, setSettings] = useState(BRANDING_DEFAULTS)
  const [loading, setLoading] = useState(true)

  const fetchBranding = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('setting_key, setting_value')
        .like('setting_key', 'branding_%')

      if (error) throw error

      const merged = { ...BRANDING_DEFAULTS }
      data?.forEach((row) => {
        if (row.setting_key in merged && row.setting_value) {
          merged[row.setting_key] = row.setting_value
        }
      })

      // Update module-level vars
      _baseAssetUrl = merged.branding_base_asset_url.replace(/\/+$/, '')
      _baseSiteUrl = merged.branding_base_site_url.replace(/\/+$/, '')

      setSettings(merged)
    } catch (err) {
      console.error('Error fetching branding settings:', err)
      // Keep defaults
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBranding()
  }, [fetchBranding])

  // Side effects: update document title and favicon
  useEffect(() => {
    document.title = settings.branding_app_name

    const faviconLink = document.querySelector("link[rel='icon']") || document.querySelector("link[rel='shortcut icon']")
    if (faviconLink) {
      faviconLink.href = settings.branding_favicon_url
    }

    // Set CSS custom property for quiz background
    document.documentElement.style.setProperty(
      '--quiz-bg-url',
      `url('${assetUrl('/Quiz_bg.jpg')}')`
    )
  }, [settings])

  const branding = {
    appName: settings.branding_app_name,
    description: settings.branding_description,
    logoUrl: settings.branding_logo_url,
    faviconUrl: settings.branding_favicon_url,
    ogImageUrl: settings.branding_og_image_url,
    baseAssetUrl: settings.branding_base_asset_url,
    baseSiteUrl: settings.branding_base_site_url,
    heroImageUrl: settings.branding_hero_image_url,
  }

  const value = {
    branding,
    assetUrl,
    siteUrl,
    loading,
    refetch: fetchBranding,
    BRANDING_DEFAULTS,
  }

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  )
}
