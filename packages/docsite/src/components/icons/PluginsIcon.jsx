import { DarkMode, Gradient } from '@/components/Icon'

export function PluginsIcon({ id, color }) {
  return (
    <>
      <defs>
        <Gradient
          id={`${id}-gradient`}
          color={color}
          gradientTransform="matrix(0 21 -21 0 20 11)"
        />
        <Gradient
          id={`${id}-gradient-dark-1`}
          color={color}
          gradientTransform="matrix(0 22.75 -22.75 0 16 6.25)"
        />
        <Gradient
          id={`${id}-gradient-dark-2`}
          color={color}
          gradientTransform="matrix(0 14 -14 0 16 10)"
        />
      </defs>
      <DarkMode strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M17.676 3.38a3.887 3.887 0 0 0-3.352 0l-9 4.288C3.907 8.342 3 9.806 3 11.416v9.168c0 1.61.907 3.073 2.324 3.748l9 4.288a3.887 3.887 0 0 0 3.352 0l9-4.288C28.093 23.657 29 22.194 29 20.584v-9.168c0-1.61-.907-3.074-2.324-3.748l-9-4.288Z"
          stroke={`url(#${id}-gradient-dark-1)`}
        />
        <path
          d="M16.406 8.087a.989.989 0 0 0-.812 0l-7 3.598A1.012 1.012 0 0 0 8 12.61v6.78c0 .4.233.762.594.925l7 3.598a.989.989 0 0 0 .812 0l7-3.598c.361-.163.594-.525.594-.925v-6.78c0-.4-.233-.762-.594-.925l-7-3.598Z"
          fill={`url(#${id}-gradient-dark-2)`}
          stroke={`url(#${id}-gradient-dark-2)`}
        />
      </DarkMode>
    </>
  )
}
