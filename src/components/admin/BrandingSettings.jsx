import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase/client';
import { Save, RefreshCw, RotateCcw, Palette, Globe, Image, Type } from 'lucide-react';
import { useBranding } from '../../hooks/useBranding';
import { invalidateSiteSettings } from '../../utils/siteSettings';

const SETTING_FIELDS = [
  { key: 'branding_app_name', label: 'App Name', type: 'text', icon: Type, description: 'Shown in browser tab and headers' },
  { key: 'branding_description', label: 'Site Description', type: 'text', icon: Type, description: 'Meta description for SEO' },
  { key: 'branding_logo_url', label: 'Logo URL', type: 'url', icon: Image, description: 'Main logo shown on login page and sidebar', preview: true },
  { key: 'branding_favicon_url', label: 'Favicon URL', type: 'url', icon: Image, description: 'Browser tab icon', preview: true, previewSize: 'small' },
  { key: 'branding_og_image_url', label: 'Social Share Image', type: 'url', icon: Image, description: 'Image shown when sharing links on social media', preview: true },
  { key: 'branding_base_asset_url', label: 'Base Asset URL', type: 'url', icon: Globe, description: 'Base URL for all images, icons, and sounds (e.g. https://yourcdn.com/assets). Do not include trailing slash.', warning: true },
  { key: 'branding_base_site_url', label: 'Base Site URL', type: 'url', icon: Globe, description: 'Base domain URL for legacy assets. Do not include trailing slash.' },
  { key: 'branding_hero_image_url', label: 'Dashboard Hero Image', type: 'url', icon: Image, description: 'Background image for the dashboard header section', preview: true },
];

const BrandingSettings = () => {
  const { BRANDING_DEFAULTS, refetch } = useBranding();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);
  const [values, setValues] = useState({ ...BRANDING_DEFAULTS });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('site_settings')
        .select('setting_key, setting_value')
        .like('setting_key', 'branding_%');

      if (error) throw error;

      const merged = { ...BRANDING_DEFAULTS };
      data?.forEach((row) => {
        if (row.setting_key in merged && row.setting_value) {
          merged[row.setting_key] = row.setting_value;
        }
      });
      setValues(merged);
    } catch (err) {
      console.error('Error fetching branding settings:', err);
      showNotification('Error loading settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const settings = SETTING_FIELDS.map((field) => ({
        setting_key: field.key,
        setting_value: (values[field.key] || '').replace(/\/+$/, ''),
        description: field.description,
      }));

      for (const s of settings) {
        const { error } = await supabase
          .from('site_settings')
          .upsert(s, { onConflict: 'setting_key' });
        if (error) throw error;
      }

      invalidateSiteSettings();
      showNotification('Branding saved! Changes are live.');
      refetch();
    } catch (err) {
      console.error('Error saving branding:', err);
      showNotification('Error saving: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setValues({ ...BRANDING_DEFAULTS });
  };

  const handleChange = (key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading branding settings...</span>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {notification && (
        <div className={`p-3 rounded-lg text-sm font-medium ${
          notification.type === 'error'
            ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-green-50 text-green-700 border border-green-200'
        }`}>
          {notification.message}
        </div>
      )}

      <div className="flex items-center gap-3 mb-2">
        <Palette className="w-6 h-6 text-gray-700" />
        <h2 className="text-xl font-bold text-gray-900">Branding Settings</h2>
      </div>

      {SETTING_FIELDS.map((field) => {
        const Icon = field.icon;
        return (
          <div key={field.key} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-1">
              <Icon className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-700">{field.label}</h3>
            </div>
            <p className="text-xs text-gray-500 mb-3">{field.description}</p>

            {field.warning && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3 text-xs text-amber-700">
                Changing this affects all images, icons, and sounds across the entire site.
              </div>
            )}

            <input
              type="text"
              value={values[field.key] || ''}
              onChange={(e) => handleChange(field.key, e.target.value)}
              placeholder={BRANDING_DEFAULTS[field.key]}
              className="w-full p-2.5 border border-gray-300 rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />

            {field.preview && values[field.key] && (
              <div className="mt-3 flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <img
                  src={values[field.key]}
                  alt="Preview"
                  className={field.previewSize === 'small' ? 'w-6 h-6 object-contain' : 'max-h-16 object-contain'}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <span className="text-xs text-gray-500">Preview</span>
              </div>
            )}
          </div>
        );
      })}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <strong>Note:</strong> OG/social sharing meta tags in <code>index.html</code> are static and won't update from here.
        The <code>vercel.json</code> image proxy also needs manual update if you change the base site URL.
      </div>

      <div className="flex justify-between">
        <button
          onClick={handleReset}
          className="flex items-center gap-2 px-4 py-2.5 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium transition-all"
        >
          <RotateCcw className="w-4 h-4" />
          Reset to Defaults
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-all"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Branding'}
        </button>
      </div>
    </div>
  );
};

export default BrandingSettings;
