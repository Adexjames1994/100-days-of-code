import React from 'react'
import style from "../Components/Hero.module.css"
import image from "../assets/img3.JPG"

const Hero = () => {
  return (
    <div className={style.heroContainer}>
      <h1 className={style.title}>Welcome to Day 1</h1>
      <div className={style.card}>
      <img src={image} alt="" className={style.img} />
      <h3 >Name: JEGEDE ADEOLA JAMES</h3>
      <p>Role: Software Engineering</p>
      </div>
      <p className={style.subtitle}>Starting my 100 Days of code with React + CSS Modules!</p>
      <button className={style.btn}>Get Started</button>
    </div>
  )
}

export default Hero
