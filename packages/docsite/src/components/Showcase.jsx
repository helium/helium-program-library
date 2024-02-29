import Link from "next/link"

export default function Showcase() {
    const projects = [
        {
            title: 'Helium Mobile App',
            href: 'https://apps.apple.com/us/app/helium-mobile/id1640323514',
            imageUrl:
                '/showcase/heliumMobile.png',
            category: 'Mobile App',
        },
        {
            title: 'Helium Wallet App',
            href: 'https://github.com/helium/wallet-app',
            imageUrl:
                '/showcase/heliumWallet.png',
            category: 'Mobile App',
        },
    ]
    return (
        <section className="bg-[#1A1A1A] py-24 sm:py-32 px-6 lg:px-8">
            <div className="mx-auto max-w-xl sm:text-center mb-12">
                <h2 data-aos="fade" className="text-base font-semibold leading-7 text-purple-400">Showcase</h2>
                <p data-aos="fade" data-aos-delay="150" className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    Meet products using the Helium Program Library
                </p>
            </div>
            <div className="mx-auto max-w-7xl">
                <div data-aos="fade" className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-6 lg:mx-0 lg:max-w-none lg:grid-cols-3">
                    {projects.map((project) => (
                        <ShowcaseCard
                            key={project.href}
                            project={project}
                        />
                    ))}
                    <ShowcaseCard isSubmitNew={true} />
                </div>
            </div>
        </section>
    )
}

function ShowcaseCard({ project, isSubmitNew }) {
    return (
        <article className="group hover:translate-y-0.5 transition duration-400 relative max-w-xl flex flex-col items-start justify-between bg-[#262626] p-4 rounded-2xl border border-[#333333]">
            {
                isSubmitNew ? (
                    <div className='bg-[#1A1A1A] flex justify-center items-center border border-[#333333] w-full rounded-xl aspect-[16/9] sm:aspect-[2/1] lg:aspect-[3/2]'>
                        <svg xmlns="http://www.w3.org/2000/svg" width="92" height="80" fill="none"><path fill="#717171" fillRule="evenodd" d="M78.138 6.641c0 .277.138.415.346.554l4.15 1.66 1.661 4.151c.138.208.277.346.554.346.207 0 .346-.138.484-.346l1.73-4.15 4.081-1.661c.208-.139.346-.277.346-.554 0-.207-.138-.346-.346-.484l-4.082-1.73-1.73-4.081C85.196.138 85.057 0 84.78 0c-.207 0-.346.138-.484.346l-1.66 4.082-4.151 1.73c-.208.137-.346.276-.346.483ZM91.49 28.78c0-.207-.138-.346-.346-.484l-4.082-1.73-1.73-4.081c-.137-.208-.276-.346-.553-.346-.207 0-.346.138-.484.346l-1.66 4.082-4.151 1.73c-.208.137-.346.276-.346.553 0 .207.138.346.346.484l4.15 1.66 1.661 4.151c.138.208.277.346.554.346.207 0 .346-.138.484-.346l1.73-4.15 4.081-1.661c.208-.138.346-.277.346-.554Zm-9.478-10.1c.346-.138.623-.553.623-.969-.07-.415-.277-.83-.623-.968l-7.817-3.944L70.32 5.05c-.416-.76-1.592-.76-2.007 0L64.44 12.8l-7.817 3.943c-.346.138-.623.553-.623.968 0 .415.277.83.623.969l7.817 3.943 3.874 7.818c.208.346.554.553 1.038.553.415 0 .761-.207.968-.553l3.875-7.818 7.817-3.943Zm-47.094-6.764c5.55 0 10.81 1.21 15.51 3.393A7.056 7.056 0 0 0 50 17.71c0 2.571 1.47 5.191 4.045 6.389l5.907 2.98 3.093 6.241.124.207c1.35 2.25 3.706 3.466 6.183 3.466h.044a36.332 36.332 0 0 1 1.584 10.682c0 16.268-9.731 27.191-24.042 32.028-1.86.44-2.576-.733-2.576-1.76 0-.386.016-.989.037-1.796.042-1.64.107-4.127.107-7.367 0-3.518-1.145-5.716-2.433-6.889 8.014-.879 16.457-2.051 16.457-16.121 0-4.104-1.431-6.009-3.72-8.647.014-.052.03-.112.05-.178.358-1.24 1.421-4.92-.48-9.788-3.005-1.026-9.874 3.957-9.874 3.957-2.862-.88-5.868-1.172-9.016-1.172-3.005 0-6.01.293-8.873 1.172 0 0-7.012-4.836-9.874-3.957-2.003 5.13-.858 8.94-.429 9.966-2.29 2.638-3.435 4.543-3.435 8.647 0 14.07 8.157 15.242 16.171 16.121-1.145 1.026-2.003 2.638-2.29 4.983-2.146 1.026-7.298 2.638-10.446-3.077-2.004-3.518-5.581-3.81-5.581-3.81-3.435 0-.143 2.344-.143 2.344 2.29 1.026 3.864 5.276 3.864 5.276 2.146 6.595 12.163 4.397 12.163 4.397v6.086c0 .88-.572 2.052-2.432 1.76C9.875 74.865 0 63.942 0 47.674c0-20.225 15.17-35.76 34.918-35.76ZM23.612 69.073c0-.293-.286-.586-.715-.586-.43 0-.716.293-.716.586s.287.586.716.44c.43 0 .715-.147.715-.44Zm-4.436-.733c.143-.293.573-.44 1.002-.293.43.146.572.44.572.733-.143.293-.572.44-.858.293-.43 0-.716-.44-.716-.733Zm6.44-.147c.286-.146.715.147.715.44.143.293-.143.44-.572.586-.43.147-.859 0-.859-.293 0-.44.287-.733.716-.733ZM13.88 62.478c.143-.147.43 0 .716.146.286.293.286.733.143.88-.286.146-.573 0-.859-.147-.143-.293-.286-.733 0-.88Zm-1.574-1.173c.143-.146.286-.146.572 0 .287.147.43.293.43.44-.143.293-.43.293-.716.146-.286-.146-.43-.293-.286-.586Zm4.58 5.276c.286-.293.715-.146 1.001.147.286.293.286.733.143.88-.143.292-.572.146-.858-.148-.43-.293-.43-.732-.287-.879Zm-1.575-2.198c.286-.147.573 0 .859.293.143.293.143.733 0 .88-.286.146-.573 0-.859-.294-.286-.293-.286-.733 0-.88Z" clipRule="evenodd" /></svg>
                    </div>
                ) : (
                    <img
                        src={project.imageUrl}
                        alt=""
                        className="aspect-[16/9] w-full rounded-xl object-cover sm:aspect-[2/1] lg:aspect-[3/2]"
                    />
                )
            }
            <h3 className="mt-2.5 text-lg font-semibold leading-6 text-white group-hover:text-gray-200">
                <Link href={isSubmitNew ? "https://github.com/helium/helium-program-library/pulls" : project.href}>
                    <span className="absolute inset-0" />
                    {isSubmitNew ? 'Don\'t see your project?' : project.title}
                </Link>
            </h3>
            <p className="mt-0.5 line-clamp-3 text-sm leading-6 text-gray-400">
                {isSubmitNew ? 'Submit a PR' : project.category}
            </p>
        </article>)
}