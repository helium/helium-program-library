import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Disclosure, Transition } from '@headlessui/react'
import clsx from 'clsx'

export function Navigation({ navigation, className }) {
  let router = useRouter()

  return (
    <nav className={clsx('text-base lg:text-sm', className)}>
      <ul role="list" className="space-y-6">
        {navigation.map((section) => (
          <li key={section.title}>
            <Disclosure defaultOpen>
              {
                ({ open }) => (
                  <>
                    <Disclosure.Button className=" w-full flex gap-2 items-center">
                      <div className='flex-shrink'>{section.icon && section.icon}</div>
                      <h2 className="font-display font-medium text-zinc-900 dark:text-white flex gap-2 items-center w-full">
                        {section.title}
                      </h2>
                      <div className="flex-grow" aria-hidden={true}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
                          className={`${open ? 'rotate-180 transform' : ''
                            } h-5 w-5 text-zinc-600 transition`}><path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd"></path></svg>
                      </div>
                    </Disclosure.Button>
                    <Transition
                      enter="transition duration-300 ease-out"
                      enterFrom="transform -translate-x-1.5 opacity-0"
                      enterTo="transform translate-x-0 opacity-100"
                      leave="transition duration-300 ease-out"
                      leaveFrom="transform translate-x-0 opacity-100"
                      leaveTo="transform -translate-x-1.5 opacity-0"
                    >
                      <Disclosure.Panel className={`text-gray-500 `} static>
                        <ul
                          id="trail-nav"
                          role="list"
                          className="mt-2 relative space-y-2 lg:mt-2 ml-2 lg:space-y-1 lg:border-zinc-200"
                        >
                          {section.links.map((link) => (
                            <li key={link.href} className="relative">
                              <Link
                                href={link.href}
                                className={clsx(
                                  'trail-nav-link',
                                  'block w-full pl-3.5 before:ring-[#202020] before:ring-2',
                                  link.href === router.pathname
                                    ? 'font-semibold text-purple-300'
                                    : 'text-zinc-500 hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-300'
                                )}
                              >
                                {link.title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </Disclosure.Panel>
                    </Transition>
                  </>
                )
              }
            </Disclosure>
          </li>
        ))}
      </ul>
    </nav>
  )
}
