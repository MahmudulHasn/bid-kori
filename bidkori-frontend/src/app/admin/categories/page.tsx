'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  FolderPlus,
  Layers,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';

import {
  ADMIN_CATEGORIES_API_PATH,
  filterAdminCategories,
  validateCategoryInput,
  type AdminCategory,
  type AdminCategoryInput,
} from '@/lib/adminCategories';
import {
  adminCategoriesListFetcher,
  createAdminCategory,
  deleteAdminCategory,
  updateAdminCategory,
} from '@/lib/adminCategoriesApi';
import { getApiErrorMessage } from '@/lib/apiErrors';

export default function AdminCategoriesPage() {
  const [search, setSearch] = useState('');
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'delete' | null>(null);
  const [targetCategory, setTargetCategory] = useState<AdminCategory | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [slugInput, setSlugInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const {
    data: categories,
    error,
    isLoading,
    mutate,
    isValidating,
  } = useSWR(ADMIN_CATEGORIES_API_PATH, adminCategoriesListFetcher);

  const filteredCategories = useMemo(
    () => filterAdminCategories(categories ?? [], search),
    [categories, search],
  );

  const openCreateModal = () => {
    setModalMode('create');
    setTargetCategory(null);
    setNameInput('');
    setSlugInput('');
    setValidationError(null);
  };

  const openEditModal = (cat: AdminCategory) => {
    setModalMode('edit');
    setTargetCategory(cat);
    setNameInput(cat.name);
    setSlugInput(cat.slug);
    setValidationError(null);
  };

  const openDeleteModal = (cat: AdminCategory) => {
    setModalMode('delete');
    setTargetCategory(cat);
  };

  const closeModal = () => {
    if (isSubmitting) return;
    setModalMode(null);
    setTargetCategory(null);
    setValidationError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: AdminCategoryInput = {
      name: nameInput,
      slug: slugInput.trim() ? slugInput.trim() : undefined,
    };

    const check = validateCategoryInput(payload);
    if (!check.valid) {
      setValidationError(check.error || 'Invalid form input.');
      return;
    }

    setValidationError(null);
    setIsSubmitting(true);
    try {
      if (modalMode === 'create') {
        const created = await createAdminCategory(payload);
        toast.success(`Category "${created.name}" created successfully.`);
      } else if (modalMode === 'edit' && targetCategory) {
        const updated = await updateAdminCategory(targetCategory.id, payload);
        toast.success(`Category "${updated.name}" updated successfully.`);
      }
      await mutate();
      closeModal();
    } catch (err) {
      const message = getApiErrorMessage(err, 'Failed to save category.');
      setValidationError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!targetCategory) return;
    setIsSubmitting(true);
    try {
      const res = await deleteAdminCategory(targetCategory.id);
      toast.success(res.message || 'Category deleted.');
      await mutate();
      closeModal();
    } catch (err) {
      const message = getApiErrorMessage(err, 'Failed to delete category.');
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Category Management
            </h1>
            <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-950/60 dark:text-violet-300">
              {categories ? categories.length : '—'} Categories
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Marketplace product taxonomy and category classification catalogue.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void mutate()}
            disabled={isValidating}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 shadow-2xs transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isValidating ? 'animate-spin text-violet-600' : ''}`}
            />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white shadow-sm shadow-violet-500/25 transition hover:bg-violet-700"
          >
            <Plus className="h-4 w-4" />
            <span>Add Category</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search categories by name or slug…"
          className="h-10 w-full rounded-xl border border-zinc-200 bg-white pr-4 pl-9 text-sm text-zinc-900 shadow-2xs transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
          <span>{getApiErrorMessage(error, 'Could not load categories.')}</span>
        </div>
      )}

      {/* Content Table / Mobile Cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-16 w-full animate-pulse rounded-2xl border border-zinc-100 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            />
          ))}
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <Layers className="h-10 w-10 text-zinc-300 dark:text-zinc-600" />
          <h3 className="mt-3 text-base font-semibold text-zinc-900 dark:text-white">
            {search ? 'No matching categories' : 'No categories yet'}
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            {search
              ? `No categories found for "${search}". Try another search term.`
              : 'Get started by creating your first marketplace category.'}
          </p>
          {!search && (
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700"
            >
              <Plus className="h-4 w-4" />
              <span>Create Category</span>
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-2xs dark:border-zinc-800 dark:bg-zinc-900">
          {/* Desktop Table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-400">
                <tr>
                  <th scope="col" className="px-5 py-3.5">
                    Category Name
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Slug
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right">
                    Products Listed
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredCategories.map((cat) => (
                  <tr
                    key={cat.id}
                    className="transition hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40"
                  >
                    <td className="px-5 py-4 font-semibold text-zinc-900 dark:text-white">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                          <Layers className="h-4 w-4" />
                        </span>
                        <span>{cat.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {cat.slug}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {cat.product_count} {cat.product_count === 1 ? 'item' : 'items'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(cat)}
                          title="Edit Category"
                          className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteModal(cat)}
                          title="Delete Category"
                          className="rounded-lg p-1.5 text-red-500 transition hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="divide-y divide-zinc-100 sm:hidden dark:divide-zinc-800">
            {filteredCategories.map((cat) => (
              <div key={cat.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                      <Layers className="h-3.5 w-3.5" />
                    </span>
                    <span className="font-semibold text-zinc-900 dark:text-white">
                      {cat.name}
                    </span>
                  </div>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {cat.product_count} items
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="font-mono">slug: {cat.slug}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(cat)}
                      className="font-medium text-violet-600 dark:text-violet-400"
                    >
                      Edit
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => openDeleteModal(cat)}
                      className="font-medium text-red-600 dark:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {(modalMode === 'create' || modalMode === 'edit') && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                {modalMode === 'create' ? 'Create New Category' : `Edit "${targetCategory?.name}"`}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                disabled={isSubmitting}
                className="rounded-lg p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Category Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="e.g. Vintage Antiques"
                  className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-2xs focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  URL Slug (Optional)
                </label>
                <input
                  type="text"
                  value={slugInput}
                  onChange={(e) => setSlugInput(e.target.value)}
                  placeholder="Auto-generated if left blank"
                  className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 font-mono text-sm text-zinc-900 shadow-2xs focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                />
                <p className="mt-1 text-[11px] text-zinc-400">
                  Lower-case letters, numbers, and hyphens only (e.g. vintage-antiques).
                </p>
              </div>

              {validationError && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  {validationError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isSubmitting}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50"
                >
                  {isSubmitting && <RefreshCw className="h-3 w-3 animate-spin" />}
                  <span>{modalMode === 'create' ? 'Create Category' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {modalMode === 'delete' && targetCategory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 dark:bg-red-950/60">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Delete Category
                </h3>
                <p className="text-xs text-zinc-500">Irreversible administrative action</p>
              </div>
            </div>

            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">
              Are you sure you want to delete{' '}
              <strong className="text-zinc-900 dark:text-white">
                &ldquo;{targetCategory.name}&rdquo;
              </strong>
              ?
            </p>

            {targetCategory.product_count > 0 && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                <strong>Notice:</strong> This category has{' '}
                <strong>{targetCategory.product_count}</strong> active products attached to
                it. Deleting it will detach the category and mark those products as
                &ldquo;Uncategorized&rdquo;.
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={isSubmitting}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
              >
                {isSubmitting && <RefreshCw className="h-3 w-3 animate-spin" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
