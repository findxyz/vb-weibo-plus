import { useMutation } from '@tanstack/react-query';
import { Button } from '@ui-sdk/react/button';
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@ui-sdk/react/dialog';
import { Field, FieldLabel } from '@ui-sdk/react/field';
import { Input } from '@ui-sdk/react/input';
import { PlusIcon, UserPlusIcon, XIcon } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { getJson, isUnauthorized } from './queries';

export default function AddBlogger({
  onAdded,
  onUnauthorized,
}: {
  onAdded: (uid: string, select: boolean) => Promise<void>;
  onUnauthorized: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [validation, setValidation] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController>(null);
  const pending = useRef(false);
  const shown = useRef(open);
  const alive = useRef(true);
  shown.current = open;
  const adding = useMutation({
    retry: false,
    mutationFn: (uid: string) => {
      controller.current = new AbortController();
      return getJson(
        `/post/bloggers?${new URLSearchParams({ uid })}`,
        controller.current.signal,
        15000,
        { method: 'POST' },
      );
    },
    onSuccess: async (_, uid) => {
      if (!alive.current) return;
      const select = shown.current;
      setOpen(false);
      await onAdded(uid, select);
    },
    onError: (error) => {
      if (alive.current && isUnauthorized(error)) {
        setOpen(false);
        onUnauthorized();
      }
    },
    onSettled: () => {
      pending.current = false;
    },
  });
  useEffect(
    () => () => {
      alive.current = false;
      controller.current?.abort();
    },
    [],
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    const trimmed = value.trim();
    const uid = /^\d{4,}$/.test(trimmed)
      ? trimmed
      : trimmed.match(/weibo\.com\/(?:u\/)?(\d{4,})/)?.[1];
    if (!uid) {
      setValidation('无法识别，请输入 UID 或 weibo.com/u/ 开头的主页链接。');
      return;
    }
    setValidation('');
    pending.current = true;
    adding.mutate(uid);
  }

  return (
    <Dialog
      open={open}
      container={document.body}
      closeOnOutsidePress={false}
      onOpenChange={(next) => {
        if (next) {
          setValue('');
          setValidation('');
          adding.reset();
        }
        setOpen(next);
      }}
    >
      <DialogTrigger
        className="blogger-add"
        aria-label="添加博主"
        title="添加博主"
        disabled={adding.isPending}
        focusableWhenDisabled
      >
        <UserPlusIcon aria-hidden="true" />
        添加博主
      </DialogTrigger>
      <DialogBackdrop className="management-backdrop" />
      <DialogContent className="management-dialog" initialFocus={() => inputRef.current}>
        <div className="management-window">
          <header className="search-overlay-titlebar">
            <DialogTitle>添加博主</DialogTitle>
            <DialogClose aria-label="关闭添加博主">
              <XIcon aria-hidden="true" />
            </DialogClose>
          </header>
          <form className="search-overlay-body" onSubmit={submit}>
            <DialogDescription className="search-overlay-tip">
              输入博主 UID 或主页链接，例如
              https://weibo.com/u/1234567890，添加后会立即拉取最新一页微博。
            </DialogDescription>
            <Field invalid={Boolean(validation || adding.isError)}>
              <FieldLabel className="sr-only">UID 或主页链接</FieldLabel>
              <Input
                ref={inputRef}
                type="text"
                placeholder="UID 或主页链接"
                autoComplete="off"
                value={value}
                onValueChange={setValue}
              />
            </Field>
            <p
              className="management-status"
              role={validation || adding.isError ? 'alert' : 'status'}
            >
              {validation ||
                (adding.isPending
                  ? '正在添加并拉取微博…'
                  : adding.isError
                    ? `添加失败：${adding.error.message}`
                    : '')}
            </p>
            <div className="search-actions">
              <Button
                type="submit"
                className="add-submit"
                aria-label="添加"
                disabled={adding.isPending}
              >
                <PlusIcon aria-hidden="true" />
                添加
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
