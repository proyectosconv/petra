// Toggle the mobile navbar visibility (hamburger menu)
function convoToggleNavbar() {
    const navbar = document.getElementById("convo_navbar");
    navbar.classList.toggle("responsive");
}

// Close mobile navbar when any link is clicked
document.querySelectorAll(".convo_navbar_link").forEach(link => {
    link.addEventListener("click", () => {
        const navbar = document.getElementById("convo_navbar");
        if (navbar.classList.contains("responsive")) {
            navbar.classList.remove("responsive");
        }

        const menu = document.getElementById("convo_navbar_links");
        if (menu.classList.contains("convo_open")) {
            menu.classList.remove("convo_open");
        }
    });
});

// Scroll window down by 200px (for some call-to-scroll interaction)
function scrollWin() {
    window.scrollTo(0, 200);
}

// Slideshow logic
let slideIndex = 1;
showSlides(slideIndex);

// Go to next/prev slide
function plusSlides(n) {
    showSlides(slideIndex += n);
}

// Go to specific slide
function currentSlide(n) {
    showSlides(slideIndex = n);
}

// Display the correct slide and activate the correct dot
function showSlides(n) {
    let i;
    const slides = document.getElementsByClassName("mySlides");
    const dots = document.getElementsByClassName("dot");
    if (n > slides.length) { slideIndex = 1; }
    if (n < 1) { slideIndex = slides.length; }

    for (i = 0; i < slides.length; i++) {
        slides[i].style.display = "none";
    }

    for (i = 0; i < dots.length; i++) {
        dots[i].className = dots[i].className.replace(" active", "");
    }

    slides[slideIndex - 1].style.display = "block";
    dots[slideIndex - 1].className += " active";
}

// Tab navigation for content sections
function convoOpenTab(index) {
    const buttons = document.querySelectorAll('.convo_tab_button');
    const contents = document.querySelectorAll('.convo_tab_content');

    buttons.forEach(btn => btn.classList.remove('active'));
    contents.forEach(content => content.classList.remove('active'));

    buttons[index].classList.add('active');
    contents[index].classList.add('active');
}

// Toggle a menu (e.g. hamburger menu animation toggle)
function toggleMenu(button) {
    button.classList.toggle('active');
    const menu = document.getElementById('hamburger_menu');
    menu.classList.toggle('show');
}
