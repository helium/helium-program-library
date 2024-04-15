import clsx from 'clsx'

import { Icon } from '@/components/Icon'

const styles = {
  note: {
    container:
      'bg-purple-800/5 ring-purple-500/20',
    title: 'text-purple-400',
    body: '[--tw-prose-background:theme(colors.purple.50)] prose-a:text-purple-900 text-purple-100 prose-code:text-purple-300',
  },
  warning: {
    container:
      'bg-amber-800/5 ring-amber-500/20',
    title: 'text-amber-900 dark:text-amber-500',
    body: 'text-amber-800 [--tw-prose-underline:theme(colors.amber.400)] [--tw-prose-background:theme(colors.amber.50)] prose-a:text-amber-900 prose-code:text-amber-900 dark:text-zinc-300 dark:[--tw-prose-underline:theme(colors.purple.700)] dark:prose-code:text-zinc-300',
  },
}

const icons = {
  note: (props) => <Icon icon="lightbulb" {...props} />,
  warning: (props) => <Icon icon="warning" color="amber" {...props} />,
}

export function Callout({ type = 'note', title, children }) {
  let IconComponent = icons[type]
  return (
    <div className={clsx('my-6 flex gap-2.5 rounded-2xl p-6 ring-1', styles[type].container)}>
      <IconComponent className="h-8 w-8 flex-none" />
      <div className="ml-4 flex-auto">
        <p className={clsx('m-0 font-display text-xl', styles[type].title)}>
          {title}
        </p>
        <div className={clsx('prose mt-2.5', styles[type].body)}>
          {children}
        </div>
      </div>
    </div>
  )
}
