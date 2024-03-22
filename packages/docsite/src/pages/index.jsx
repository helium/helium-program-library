import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import clsx from 'clsx'
import { navigation } from '@/data/navigation'
import { features } from '@/data/home'

import { MobileNavigation } from '@/components/MobileNavigation'
import Showcase from '@/components/Showcase'
import Hexagon from '@/components/Hexagon'

import Link from 'next/link'

import { LogomarkHelium, LogoHeliumGovernance } from '@/components/Logo'
import { Search } from '@/components/Search'
import Footer from '@/components/Footer'

function GitHubIcon(props) {
    return (
        <svg aria-hidden="true" viewBox="0 0 16 16" {...props}>
            <path d="M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.42 6.02 15.21C6.02 15.02 6.01 14.39 6.01 13.72C4 14.09 3.48 13.23 3.32 12.78C3.23 12.55 2.84 11.84 2.5 11.65C2.22 11.5 1.82 11.13 2.49 11.12C3.12 11.11 3.57 11.7 3.72 11.94C4.44 13.15 5.59 12.81 6.05 12.6C6.12 12.08 6.33 11.73 6.56 11.53C4.78 11.33 2.92 10.64 2.92 7.58C2.92 6.71 3.23 5.99 3.74 5.43C3.66 5.23 3.38 4.41 3.82 3.31C3.82 3.31 4.49 3.1 6.02 4.13C6.66 3.95 7.34 3.86 8.02 3.86C8.7 3.86 9.38 3.95 10.02 4.13C11.55 3.09 12.22 3.31 12.22 3.31C12.66 4.41 12.38 5.23 12.3 5.43C12.81 5.99 13.12 6.7 13.12 7.58C13.12 10.65 11.25 11.33 9.47 11.53C9.76 11.78 10.01 12.26 10.01 13.01C10.01 14.08 10 14.94 10 15.21C10 15.42 10.15 15.67 10.55 15.59C13.71 14.53 16 11.53 16 8C16 3.58 12.42 0 8 0Z" />
        </svg>
    )
}

function Header({ navigation }) {
    let [isScrolled, setIsScrolled] = useState(false)
    let router = useRouter()

    useEffect(() => {
        function onScroll() {
            setIsScrolled(window.scrollY > 0)
        }
        onScroll()
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => {
            window.removeEventListener('scroll', onScroll)
        }
    }, [])

    return (
        <header
            className={clsx(
                'sticky top-0 z-50 flex h-14 flex-wrap items-center justify-between px-4 transition duration-500 sm:px-6 lg:px-8',
                isScrolled
                    ? 'bg-zinc-800/[var(--bg-opacity-light)] backdrop-blur-md'
                    : 'bg-transparent'
            )}
        >
            <div className="mr-6 flex lg:hidden">
                <MobileNavigation navigation={navigation} />
            </div>
            <div className="relative flex flex-grow basis-0 items-center">
                <Link href="/" aria-label="Home page" className="flex gap-3">
                    <LogomarkHelium className="h-9 w-9" />
                    <LogoHeliumGovernance className="hidden lg:block" />
                </Link>
            </div>
            <div className="relative flex basis-0 items-center justify-end gap-4 md:flex-grow">
                <Search />
                <Link href="https://github.com/helium/helium-program-library" className="group" aria-label="GitHub">
                    <GitHubIcon className="h-6 w-6 fill-zinc-400 group-hover:fill-zinc-500 dark:group-hover:fill-zinc-300" />
                </Link>
            </div>
        </header>
    )
}

export default function Home() {
    return (
        <>
            <Head>
                <title>Home | Helium Program Library</title>
            </Head>
            <div className='overflow-hidden'>
                <Header navigation={navigation} />
                {/* ---- HERO --- */}
                <section className="relative flex pb-32 flex-col items-center gap-6 md:overflow-visible px-8 pt-32 lg:pt-36">
                    <div className='absolute -z-10 top-[80px] lg:top-[100px] hidden -translate-y-0 dark:block w-full h-full flex justify-center items-center'>
                        <div>
                            <div className="animation-wrapper relative -z-[7]" data-aos="zoom-out" data-aos-easing="ease-in-out" data-aos-delay="250">
                                <Hexagon className="animate-breathe absolute" scale={1} color="#292929" />
                            </div>
                            <div className="animation-wrapper relative -z-[8]" data-aos="zoom-out" data-aos-easing="ease-in-out" data-aos-delay="350">
                                <Hexagon className="animate-breathe absolute" animationDelay={550} scale={2} color="#262626" />
                            </div>
                            <div className="animation-wrapper relative -z-[9]" data-aos="zoom-out" data-aos-easing="ease-in-out" data-aos-delay="450">
                                <Hexagon className="animate-breathe absolute" animationDelay={650} scale={3} color="#242424" />
                            </div>
                            <div className="animation-wrapper relative -z-[10]" data-aos="zoom-out" data-aos-easing="ease-in-out" data-aos-delay="550">
                                <Hexagon className="animate-breathe absolute" animationDelay={750} scale={4} color="#212121" />
                            </div>
                        </div>
                    </div>

                    <div className="relative z-10 flex w-full flex-col items-center">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="210"
                            height="230"
                            fill="none"
                            data-aos="fade" data-aos-delay="550"
                            className="relative z-10"
                        >
                            <path
                                fill="#1a1f36"
                                d="M85.054 5.321a39.719 39.719 0 0 1 39.719 0l65.195 37.64a39.72 39.72 0 0 1 19.86 34.398v75.28a39.72 39.72 0 0 1-19.86 34.398l-65.195 37.64a39.715 39.715 0 0 1-39.719 0l-65.194-37.64A39.718 39.718 0 0 1 0 152.639v-75.28a39.72 39.72 0 0 1 19.86-34.398l65.194-37.64Z"
                            />
                            <path
                                className="origin-center animate-slow-bounce"
                                fill="#9d5feb"
                                d="M92.005 39.042a25.817 25.817 0 0 1 25.817 0l46.419 26.8A25.817 25.817 0 0 1 177.149 88.2v53.599c0 9.224-4.92 17.747-12.908 22.359l-46.419 26.799a25.816 25.816 0 0 1-25.817 0l-46.418-26.799a25.818 25.818 0 0 1-12.909-22.359v-53.6c0-9.223 4.92-17.746 12.909-22.358l46.418-26.8Z"
                            />
                            <g
                                filter="url(#b)"
                                opacity=".7"
                                className="origin-center animate-slow-bounce"
                            >
                                <path
                                    fill="#000"
                                    fillOpacity=".4"
                                    d="M98.956 109.703 37.39 77.266v82.749l61.565 34.423v-84.735Z"
                                />
                            </g>
                            <g
                                filter="url(#c)"
                                opacity=".7"
                                className="origin-center animate-slow-bounce"
                            >
                                <path
                                    fill="#000"
                                    fillOpacity=".4"
                                    d="m110.872 109.703 61.565-32.437v82.749l-61.565 34.423v-84.735Z"
                                />
                            </g>
                            <defs>
                                <filter
                                    id="b"
                                    width="85.565"
                                    height="141.172"
                                    x="25.391"
                                    y="65.266"
                                    colorInterpolationFilters="sRGB"
                                    filterUnits="userSpaceOnUse"
                                >
                                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                                    <feBlend
                                        in="SourceGraphic"
                                        in2="BackgroundImageFix"
                                        result="shape"
                                    />
                                    <feGaussianBlur
                                        result="effect1_foregroundBlur_12_70"
                                        stdDeviation="6"
                                    />
                                </filter>
                                <filter
                                    id="c"
                                    width="85.565"
                                    height="141.172"
                                    x="98.872"
                                    y="65.266"
                                    colorInterpolationFilters="sRGB"
                                    filterUnits="userSpaceOnUse"
                                >
                                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                                    <feBlend
                                        in="SourceGraphic"
                                        in2="BackgroundImageFix"
                                        result="shape"
                                    />
                                    <feGaussianBlur
                                        result="effect1_foregroundBlur_12_70"
                                        stdDeviation="6"
                                    />
                                </filter>
                                <linearGradient
                                    id="a2"
                                    x1="104.914"
                                    x2="104.914"
                                    y1="-6.145"
                                    y2="236.143"
                                    gradientUnits="userSpaceOnUse"
                                >
                                    <stop stopColor="#20DEB0" />
                                    <stop offset="1" stopColor="#C5F7EB" />
                                </linearGradient>
                            </defs>
                        </svg>
                        <h1 data-aos="fade" data-aos-delay="600" className="mt-12 max-w-2xl text-center text-3xl font-bold text-white md:text-6xl">
                            <span className='text-zinc-400'>Elevate Networks with</span> Helium Program Library
                        </h1>
                        <div data-aos="fade" data-aos-delay="750" className='mt-10 flex flex-col sm:flex-row flex-wrap gap-3 w-full max-w-sm justify-center'>
                            <Link href="/docs/installation"
                                className="rounded-xl bg-purple-500 w-full px-3 py-3 text-base text-center sm:text-left sm:w-max sm:px-5 sm:py-4 sm:text-lg font-semibold text-purple-950 shadow-sm hover:translate-y-0.5 transition duration-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400">
                                Get started
                            </Link>
                            <Link href="#features"
                                className="rounded-xl bg-zinc-700 w-full px-3 py-3 text-base text-center sm:text-left sm:w-max sm:px-5 sm:py-4 sm:text-lg font-semibold text-white shadow-sm hover:translate-y-0.5 transition duration-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400">
                                Learn more
                            </Link>
                        </div>
                    </div>
                </section>

                <section id="features" className="z-10 mt-10 py-24 sm:py-32 gap-6 px-8">
                    <div className="mx-auto max-w-xl sm:text-center mb-12">
                        <h2 data-aos="fade" className="text-base font-semibold leading-7 text-purple-400">Features at glance</h2>
                        <p data-aos="fade" data-aos-delay="150" className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                            Mastering Helium. Made easy.
                        </p>
                        <p data-aos="fade" data-aos-delay="250" className="mt-2 text-lg leading-8 text-gray-300">Tweak parameters, manage entities, and more with the Helium Program Library.</p>
                    </div>
                    <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">

                        {features.map((feature, idx) => (
                            <FeatureCard
                                data-aos="fade" data-aos-delay={idx * 50}
                                key={feature.title}
                                icon={feature.icon}
                                comingSoon={feature.comingSoon}
                                title={feature.title}
                                description={feature.description}
                            />
                        ))}
                    </div>
                </section>

                <Showcase />
                <div className='p-8 pb-4 pt-0'>
                    <Footer noDivider />
                </div>
            </div>
        </>
    )
}


function FeatureCard(props) {
    return (
        <div
            {...props}
            className="relative flex flex-col gap-2 overflow-hidden rounded-2xl border border-[#333333] bg-[#262626] p-4"
        >
            <div className="bg-neutral/10 flex h-12 w-12 items-center justify-center rounded-full dark:bg-white/10">
                {props.icon}
            </div>
            <h3 className="text-lg font-bold text-black dark:text-white">
                {props.title}
            </h3>
            <p className="pl-1 text-gray-400">
                {props.description}
            </p>
        </div>
    )
}
